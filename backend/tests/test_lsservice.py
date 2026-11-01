from __future__ import annotations

import asyncio
import socket
from pathlib import Path

import httpx

from syd.config import Paths
from syd.lsservice import multicast_ip
from syd.state import AppState


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_multicast_ip_uses_selected_network_interface(monkeypatch):
    class FakeSocket:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def connect(self, address):
            assert address == ("224.0.0.167", 53317)

        def getsockname(self):
            return ("192.168.1.42", 53317)

    monkeypatch.setattr("syd.lsservice.socket.socket", lambda *_: FakeSocket())
    assert multicast_ip(53317) == "192.168.1.42"


PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
    b"\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\xc9\xfe\x92\xef"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _flow(tmp_path: Path) -> None:
    port = free_port()
    state = AppState(
        Paths(tmp_path / "data"),
        localsend_port=port,
        multicast=False,
        background=True,
        recognise=lambda data, mime, lang=None: [],
    )
    await state.boot()
    await state.setup_create("password", "ein-passwort-1")
    await state.setup_confirm("ein-passwort-1")
    try:
        assert state.ls.status()["running"]
        base = f"https://127.0.0.1:{port}/api/localsend/v2"
        async with httpx.AsyncClient(verify=False, timeout=10) as c:
            body = {
                "info": {"alias": "Handy", "fingerprint": "abc123", "deviceType": "mobile"},
                "files": {
                    "f1": {
                        "id": "f1",
                        "fileName": "scan.png",
                        "size": len(PNG),
                        "fileType": "image/png",
                    }
                },
            }
            prep = asyncio.create_task(c.post(f"{base}/prepare-upload", json=body))
            for _ in range(100):
                if state.ls.pending_requests():
                    break
                await asyncio.sleep(0.05)
            req = state.ls.pending_requests()[0]
            assert req["device"]["alias"] == "Handy" and not req["trusted"]
            assert state.ls.decide(req["id"], True, trust=True)
            res = await prep
            assert res.status_code == 200
            data = res.json()
            up = await c.post(
                f"{base}/upload",
                params={
                    "sessionId": data["sessionId"],
                    "fileId": "f1",
                    "token": data["files"]["f1"],
                },
                content=PNG,
            )
            assert up.status_code == 200
        for _ in range(100):
            if state.importer.pending():
                break
            await asyncio.sleep(0.05)
        batch = state.importer.pending()[0]
        assert batch["source"] == "localsend" and batch["device_alias"] == "Handy"
        assert state.vault.scalar("SELECT count(*) FROM trusted_device") == 1
        # Ohne Auto-Annahme wird trotz Vertrauen weiter gefragt
        assert state.ls.receiver.trusted == set()
    finally:
        await state.shutdown()


def test_localsend_request_decision_and_import(tmp_path):
    asyncio.run(_flow(tmp_path))

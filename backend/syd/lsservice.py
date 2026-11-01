"""LocalSend-Empfang als Hintergrunddienst im Event-Loop der Anwendung."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import socket
import sys
from collections.abc import Callable
from pathlib import Path

import uvicorn

from . import localsend
from .jobs import EventHub
from .localsend import Batch, DeviceInfo, IncomingFile, Receiver
from .util import now_iso

log = logging.getLogger("syd.localsend")


class _QuietServer(uvicorn.Server):
    """Zweiter Server im selben Loop: darf keine Signal-Handler des Hauptservers ueberschreiben."""

    @contextlib.contextmanager
    def capture_signals(self):
        yield


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if sys.platform != "win32":
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
        except OSError:
            return False
    return True


class LocalSendService:
    def __init__(
        self,
        *,
        repo,
        importer,
        hub: EventHub,
        certs_dir: Path,
        quarantine_dir: Path,
        port: int = localsend.DEFAULT_PORT,
        multicast: bool = True,
        on_registered: Callable[[int], None] | None = None,
    ):
        self.repo = repo
        self.v = repo.v
        self.importer = importer
        self.hub = hub
        self.certs_dir = certs_dir
        self.quarantine_dir = quarantine_dir
        self.port = port
        self.use_multicast = multicast
        self.receiver: Receiver | None = None
        self.server: uvicorn.Server | None = None
        self.task: asyncio.Task | None = None
        self.transport = None
        self.error: str | None = None
        self.requests: dict[str, dict] = {}
        self.on_registered = on_registered

    # --- Lebenszyklus ------------------------------------------------------------

    def settings(self) -> dict:
        return self.repo.get_settings()

    def trusted_fingerprints(self) -> set[str]:
        if not self.settings()["localsend_auto_accept"]:
            return set()
        return {r["fingerprint"] for r in self.v.rows("SELECT fingerprint FROM trusted_device")}

    async def start(self) -> None:
        s = self.settings()
        if not s["localsend_enabled"]:
            self.error = None
            return
        cert, key, fingerprint = localsend.make_self_signed_cert(self.certs_dir)
        self.receiver = Receiver(
            self.quarantine_dir,
            alias=s["localsend_alias"],
            fingerprint=fingerprint,
            tls_identity=(cert, key),
            port=self.port,
            decider=self._decide,
            on_batch=self._on_batch,
            trusted_fingerprints=self.trusted_fingerprints(),
            pin=s["localsend_pin"] or None,
            max_file_size=int(s["max_file_mb"]) * 1024 * 1024,
        )
        if not port_free(self.port):
            self.error = "port_belegt"
            log.warning("localsend_port_busy port=%d", self.port)
            return
        config = uvicorn.Config(
            localsend.create_app(self.receiver),
            host="0.0.0.0",  # noqa: S104 - Empfang aus dem lokalen Netz ist der Zweck
            port=self.port,
            ssl_certfile=str(cert),
            ssl_keyfile=str(key),
            log_config=None,
            access_log=False,
            lifespan="off",
        )
        self.server = _QuietServer(config)
        self.task = asyncio.create_task(self._serve())
        for _ in range(50):
            if self.server.started or self.task.done():
                break
            await asyncio.sleep(0.05)
        if self.task.done():
            self.error = self.error or "start_fehlgeschlagen"
            return
        self.error = None
        if self.use_multicast:
            try:
                self.transport = await localsend.start_multicast(self.receiver)
            except OSError as exc:
                self.error = "multicast_fehlgeschlagen"
                log.warning(
                    "localsend_multicast_failed type=%s errno=%s winerror=%s",
                    type(exc).__name__,
                    exc.errno if exc.errno is not None else "none",
                    getattr(exc, "winerror", None) or "none",
                )

    async def _serve(self) -> None:
        try:
            await self.server.serve()
        except SystemExit:
            self.error = "start_fehlgeschlagen"
        except Exception as exc:
            self.error = "start_fehlgeschlagen"
            log.error("localsend_crashed type=%s", type(exc).__name__)

    async def stop(self) -> None:
        for req in list(self.requests.values()):
            if not req["future"].done():
                req["future"].set_result(set())
        if self.transport:
            self.transport.close()
            self.transport = None
        if self.server and self.task and not self.task.done():
            self.server.should_exit = True
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self.task, 5)
        self.server = self.task = self.receiver = None

    async def restart(self) -> None:
        await self.stop()
        await self.start()

    def refresh(self) -> None:
        """Einstellungen (Alias, PIN, Auto-Annahme) ohne Neustart uebernehmen."""
        if not self.receiver:
            return
        s = self.settings()
        self.receiver.alias = s["localsend_alias"]
        self.receiver.pin = s["localsend_pin"] or None
        self.receiver.max_file_size = int(s["max_file_mb"]) * 1024 * 1024
        self.receiver.trusted = self.trusted_fingerprints()

    def status(self) -> dict:
        running = bool(self.server and self.server.started and not (self.task and self.task.done()))
        return {
            "enabled": bool(self.settings()["localsend_enabled"]),
            "running": running,
            "error": self.error,
            "port": self.port,
            "ip": next(iter(localsend.multicast_interfaces(self.port)), None),
            "alias": self.receiver.alias if self.receiver else self.settings()["localsend_alias"],
            "fingerprint": self.receiver.fingerprint if self.receiver else None,
            "pin_set": bool(self.settings()["localsend_pin"]),
        }

    # --- Entscheidung ------------------------------------------------------------

    async def _decide(self, device: DeviceInfo, files: list[IncomingFile]) -> set[str]:
        req_id = secrets.token_urlsafe(8)
        known = self.v.row(
            "SELECT id FROM trusted_device WHERE fingerprint = ?", (device.fingerprint,)
        )
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self.requests[req_id] = {
            "id": req_id,
            "device": {"alias": device.alias, "fingerprint": device.fingerprint, "ip": device.ip},
            "trusted": bool(known),
            "files": [
                {"id": f.id, "name": f.file_name, "size": f.size, "mime": f.mime} for f in files
            ],
            "received_at": now_iso(),
            "future": future,
        }
        self.hub.publish("incoming.request", request_id=req_id)
        try:
            return await future
        finally:
            self.requests.pop(req_id, None)
            self.hub.publish("incoming.closed", request_id=req_id)

    def pending_requests(self) -> list[dict]:
        return [{k: v for k, v in r.items() if k != "future"} for r in self.requests.values()]

    def decide(self, req_id: str, accept: bool, trust: bool = False) -> bool:
        req = self.requests.get(req_id)
        if not req or req["future"].done():
            return False
        if accept and trust:
            dev = req["device"]
            with self.v.tx():
                self.v.execute(
                    "INSERT OR IGNORE INTO trusted_device (fingerprint, alias, trusted_since)"
                    " VALUES (?,?,?)",
                    (dev["fingerprint"], dev["alias"][:64], now_iso()),
                )
                self.v.audit("device.trusted")
            self.refresh()
        req["future"].set_result({f["id"] for f in req["files"]} if accept else set())
        return True

    async def _on_batch(self, batch: Batch) -> None:
        batch_id = await asyncio.to_thread(self.importer.register_localsend, batch)
        self.hub.publish("import.received", batch_id=batch_id)
        if self.on_registered:
            self.on_registered(batch_id)

from __future__ import annotations

import io
import sys
import zipfile
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))

from synth import DOCS, render, to_bytes  # noqa: E402

from syd.api import create_app  # noqa: E402
from syd.config import Paths  # noqa: E402
from syd.extract import ocr  # noqa: E402
from syd.state import AppState  # noqa: E402

TOKEN = "test-token"
H = {"X-SYD-Token": TOKEN}
needs_ocr = pytest.mark.skipif(not ocr.status()["available"], reason="Tesseract (deu) fehlt")


def make(tmp_path):
    paths = Paths(tmp_path / "data")
    state = AppState(paths, background=False, today=lambda: date(2024, 3, 20), multicast=False)
    app = create_app(state, TOKEN)
    return TestClient(app, base_url="http://127.0.0.1"), state


def setup_key(c: TestClient) -> str:
    r = c.post("/api/setup/create", json={"mode": "key"}, headers=H)
    assert r.status_code == 200, r.text
    key = r.json()["recovery_key"]
    r = c.post("/api/setup/confirm", json={"secret": key}, headers=H)
    assert r.status_code == 200, r.text
    return key


def test_guard_token_host_origin(tmp_path):
    with make(tmp_path)[0] as c:
        assert c.get("/api/health").json() == {"ok": True}
        assert c.get("/api/status").status_code == 401
        assert c.get("/api/status", headers=H).json()["state"] == "setup"
        assert c.get("/api/status", headers={"X-SYD-Token": "falsch"}).status_code == 401
        assert (
            c.get("/api/status", headers={**H, "Origin": "https://evil.example"}).status_code == 403
        )
        assert c.get("/api/status", headers={**H, "Host": "evil.example"}).status_code == 403
        ok = c.get("/api/status", headers={**H, "Origin": "tauri://localhost"})
        assert ok.status_code == 200
        pre = c.options(
            "/api/status",
            headers={"Origin": "tauri://localhost", "Access-Control-Request-Method": "GET"},
        )
        assert pre.headers["access-control-allow-origin"] == "tauri://localhost"


def test_shutdown_works_before_setup(tmp_path):
    paths = Paths(tmp_path / "data")
    state = AppState(paths, background=False, multicast=False)
    calls = []
    app = create_app(state, TOKEN, request_exit=lambda: calls.append(1))
    with TestClient(app, base_url="http://127.0.0.1") as c:
        assert c.post("/api/shutdown", headers=H).status_code == 200
    assert calls == [1]


def test_locked_until_setup_and_wrong_confirm(tmp_path):
    with make(tmp_path)[0] as c:
        r = c.get("/api/documents", headers=H)
        assert r.status_code == 423 and r.json()["code"] == "einrichtung"
        r = c.post("/api/setup/create", json={"mode": "key"}, headers=H)
        key = r.json()["recovery_key"]
        bad = c.post("/api/setup/confirm", json={"secret": "AAAA-BBBB"}, headers=H)
        assert bad.status_code == 400 and bad.json()["code"] == "rueckeingabe_falsch"
        assert c.get("/api/documents", headers=H).status_code == 423
        assert c.post("/api/setup/confirm", json={"secret": key}, headers=H).status_code == 200
        assert c.get("/api/documents", headers=H).json()["total"] == 0
        again = c.post("/api/setup/create", json={"mode": "key"}, headers=H)
        assert again.status_code == 409


def test_password_too_short_and_restart_flow(tmp_path):
    c, state = make(tmp_path)
    with c:
        short = c.post(
            "/api/setup/create", json={"mode": "password", "password": "kurz"}, headers=H
        )
        assert short.status_code == 400
        r = c.post(
            "/api/setup/create", json={"mode": "password", "password": "sehr-geheim-1"}, headers=H
        )
        assert r.status_code == 200 and "recovery_key" not in r.json()
        wrong = c.post("/api/setup/confirm", json={"secret": "anders-geheim"}, headers=H)
        assert wrong.status_code == 400
        assert (
            c.post("/api/setup/confirm", json={"secret": "sehr-geheim-1"}, headers=H).status_code
            == 200
        )
        assert c.post("/api/lock", headers=H).json()["state"] == "locked"
        assert c.get("/api/documents", headers=H).json()["code"] == "gesperrt"
        assert c.post("/api/unlock", json={"secret": "falsch-falsch"}, headers=H).status_code == 401
        assert c.post("/api/unlock", json={"secret": "sehr-geheim-1"}, headers=H).status_code == 200
        assert c.get("/api/documents", headers=H).status_code == 200
    c2, state2 = make(tmp_path)
    with c2:
        st = c2.get("/api/status", headers=H).json()
        assert st["state"] == "locked" and st["reason"] == "passwort" and st["mode"] == "password"
        assert (
            c2.post("/api/unlock", json={"secret": "sehr-geheim-1"}, headers=H).status_code == 200
        )


def test_key_mode_restart_unlocks_automatically_and_missing_vault_not_recreated(tmp_path):
    c, state = make(tmp_path)
    with c:
        setup_key(c)
        vault_path = state.vault.path
    c2, _ = make(tmp_path)
    with c2:
        assert c2.get("/api/status", headers=H).json()["state"] == "ready"
    vault_path.unlink()
    c3, _ = make(tmp_path)
    with c3:
        st = c3.get("/api/status", headers=H).json()
        assert st["state"] == "locked"
        r = c3.post("/api/unlock", json={"secret": "x"}, headers=H)
        assert r.status_code == 404 and r.json()["code"] == "archiv_fehlt"
        assert not vault_path.exists()


def test_security_changes(tmp_path):
    c, state = make(tmp_path)
    with c:
        key = setup_key(c)
        assert (
            c.post(
                "/api/security/password",
                json={"current": "nope", "new": "neues-passwort"},
                headers=H,
            ).status_code
            == 401
        )
        assert (
            c.post(
                "/api/security/password", json={"current": key, "new": "neues-passwort"}, headers=H
            ).status_code
            == 200
        )
        assert not state.paths.key_file.exists()
        prep = c.post("/api/security/key/prepare", json={"current": "neues-passwort"}, headers=H)
        new_key = prep.json()["recovery_key"]
        assert (
            c.post("/api/security/key/apply", json={"secret": "AAAA"}, headers=H).status_code == 400
        )
        assert (
            c.post("/api/security/key/apply", json={"secret": new_key}, headers=H).status_code
            == 200
        )
        assert state.paths.key_file.exists()
    c2, _ = make(tmp_path)
    with c2:
        assert c2.get("/api/status", headers=H).json()["state"] == "ready"


def test_dev_tools_toggle_needs_secret(tmp_path):
    c, _ = make(tmp_path)
    with c:
        key = setup_key(c)
        assert c.get("/api/dev/info", headers=H).status_code == 403
        assert c.post("/api/dev/enable", json={"secret": "falsch"}, headers=H).status_code == 401
        assert c.post("/api/dev/enable", json={"secret": key}, headers=H).status_code == 200
        info = c.get("/api/dev/info", headers=H).json()
        assert info["tables"]["document"] == 0
        c.put("/api/settings", json={"developer_mode": False}, headers=H)
        assert c.get("/api/dev/info", headers=H).status_code == 200  # Schalter nur per /dev/*
        c.post("/api/dev/disable", headers=H)
        assert c.get("/api/dev/info", headers=H).status_code == 403


@needs_ocr
def test_end_to_end_upload_review_export(tmp_path):
    c, state = make(tmp_path)
    with c:
        setup_key(c)
        png = to_bytes(render(DOCS[0]))
        r = c.post(
            "/api/import/upload",
            files=[
                ("files", ("scan.png", png, "image/png")),
                ("files", ("evil.exe", b"MZ\x90\x00", "application/octet-stream")),
            ],
            headers=H,
        )
        body = r.json()
        assert body["files"] == 1 and len(body["rejected"]) == 1
        pending = c.get("/api/import/pending", headers=H).json()["items"]
        file_id = pending[0]["files"][0]["id"]
        assert c.get(f"/api/import/files/{file_id}", headers=H).content == png
        res = c.post(
            f"/api/import/{body['batch_id']}/commit", json={"groups": [[file_id]]}, headers=H
        ).json()
        doc_id = res["created"][0]
        state.jobs.run_pending()
        d = c.get(f"/api/documents/{doc_id}", headers=H).json()
        assert d["state"] == "erkannt"
        assert d["company_name"] == "Vodafone GmbH" or d["extractions"]
        assert any(x["type"] == "zahlungsziel" for x in d["deadlines"])
        unconfirmed = c.get("/api/deadlines", headers=H).json()["items"]
        assert unconfirmed == []  # unbestaetigte Fristen erzeugen nichts

        spec = [{**dl, "confirmed": True} for dl in d["deadlines"] if dl["type"] == "zahlungsziel"]
        r = c.post(
            f"/api/documents/{doc_id}/confirm",
            json={
                "fields": {"doc_type": "Rechnung", "doc_date": "2024-03-12", "amount_cents": 4994},
                "company_name": "Vodafone GmbH",
                "create_company": True,
                "deadlines": spec,
            },
            headers=H,
        )
        assert r.status_code == 200, r.text
        assert r.json()["state"] == "geprueft"
        items = c.get("/api/deadlines", headers=H).json()["items"]
        assert len(items) == 1 and items[0]["due_date"] == "2024-03-26"

        file = c.get(f"/api/documents/{doc_id}/parts/1/file", headers=H)
        assert file.content == png and file.headers["content-type"] == "image/png"
        assert c.get(f"/api/documents/{doc_id}/thumbnails/1", headers=H).status_code == 200
        assert c.get(f"/api/documents/{doc_id}/parts/9/file", headers=H).status_code == 404

        found = c.get("/api/documents", params={"q": "Vodafone"}, headers=H).json()
        assert found["total"] == 1
        st = c.get("/api/stats", params={"group_by": "firma"}, headers=H).json()
        assert st["total_cents"] == 4994
        csv = c.get("/api/stats.csv", headers=H)
        assert csv.content.startswith(b"\xef\xbb\xbf")

        z = c.post(
            "/api/export/download",
            json={"path_template": "{firma}/{jahr}", "file_template": "{datum}_{art}"},
            headers=H,
        )
        names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
        assert names == ["Vodafone GmbH/2024/2024-03-12_Rechnung.png"]

        c.post(f"/api/documents/{doc_id}/paid", json={"paid": True}, headers=H)
        assert c.get("/api/deadlines", headers=H).json()["items"] == []
        dash = c.get("/api/dashboard", headers=H).json()
        assert dash["to_review"] == 0 and dash["documents_total"] == 1
        days = c.get("/api/audit/days", headers=H).json()["items"]
        assert days and c.get(f"/api/audit/{days[0]}", headers=H).json()["items"]
        assert c.get("/api/audit/nicht-ein-datum", headers=H).status_code == 400


def test_company_conflict_and_settings_validation(tmp_path):
    c, _ = make(tmp_path)
    with c:
        setup_key(c)
        assert c.post("/api/companies", json={"name": "Telekom GmbH"}, headers=H).status_code == 200
        r = c.put("/api/settings", json={"localsend_pin": "12"}, headers=H)
        assert r.status_code == 400 and "PIN" in r.json()["message"]
        r = c.put("/api/settings", json={"ollama_url": "http://example.com"}, headers=H)
        assert r.status_code == 400
        ok = c.put("/api/settings", json={"font_size": 18}, headers=H)
        assert ok.json()["font_size"] == 18
        assert c.get("/api/documents/999", headers=H).status_code == 404
        r = c.get("/api/documents", params={"limit": 0}, headers=H)
        assert r.status_code == 422


def test_ui_static_and_path_traversal(tmp_path):
    ui = tmp_path / "ui"
    ui.mkdir()
    (ui / "index.html").write_text("<html>ui</html>")
    (tmp_path / "secret.txt").write_text("geheim")
    paths = Paths(tmp_path / "data")
    state = AppState(paths, background=False, multicast=False)
    app = create_app(state, TOKEN, ui_dir=ui)
    with TestClient(app, base_url="http://127.0.0.1") as c:
        r = c.get("/")
        assert r.status_code == 200 and "ui" in r.text
        assert "Content-Security-Policy" in r.headers
        assert c.get("/irgendeine/ansicht").text == "<html>ui</html>"
        assert "geheim" not in c.get("/..%2Fsecret.txt").text
        assert c.get("/api/nichtda").status_code in (401, 404)


def test_update_check_endpoints(tmp_path, monkeypatch):
    from syd import updates

    calls = []

    def fake(*a, **k):
        calls.append(1)
        return {"status": "aktuell", "current": "1.0.0", "checked_at": "2099-01-01T00:00:00+00:00"}

    monkeypatch.setattr(updates, "check", fake)
    c, _ = make(tmp_path)
    with c:
        setup_key(c)
        assert c.get("/api/updates", headers=H).json()["status"] == "nicht_geprueft"
        auto = c.post("/api/updates/check", json={"auto": True}, headers=H)
        assert auto.status_code == 409 and not calls
        assert c.post("/api/updates/check", json={}, headers=H).json()["status"] == "aktuell"
        c.put("/api/settings", json={"update_check_auto": True}, headers=H)
        assert c.post("/api/updates/check", json={"auto": True}, headers=H).status_code == 200
        assert len(calls) == 1  # frisches Ergebnis wird wiederverwendet
        assert c.get("/api/updates", headers=H).json()["status"] == "aktuell"
        assert c.post("/api/updates/open", headers=H).status_code == 404
        opened = []
        monkeypatch.setattr("webbrowser.open", lambda u: opened.append(u) or True)
        url = "https://github.com/moonyxc/SaveYourDocuments/releases/tag/v2"
        monkeypatch.setattr(
            updates,
            "check",
            lambda: {"status": "update", "url": url, "checked_at": "2099-01-01T00:00:00+00:00"},
        )
        c.post("/api/updates/check", json={}, headers=H)
        assert c.post("/api/updates/open", headers=H).json()["opened"] is True
        assert opened == [url]

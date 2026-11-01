"""HTTP-Schnittstelle (nur 127.0.0.1, Token) und Auslieferung der Oberflaeche."""

from __future__ import annotations

import asyncio
import csv
import hmac
import io
import logging
import tempfile
from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from . import __version__, backups, firewall, logs, stats
from .extract import ocr, ollama
from .repo import DEADLINE_TYPES, DOC_TYPES, REF_TYPES, ArchiveError, NotFoundError
from .state import AppState

log = logging.getLogger("syd.api")

OPEN_PATHS = ("/api/health",)
UNLOCKED_PATHS = ("/api/status", "/api/setup/", "/api/unlock", "/api/shutdown")
CORS_ORIGINS = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]"}
EXPORT_FILTERS = {
    "q", "company_id", "doc_type", "category_id", "date_from", "date_to", "amount_min",
    "amount_max", "tag_ids", "paid",
}  # fmt: skip
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}
UI_CSP = (
    "default-src 'self'; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*;"
    " style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*"
    " ws://localhost:*; frame-src 'self' http://127.0.0.1:* http://localhost:*; object-src 'self'"
    " http://127.0.0.1:* http://localhost:*; frame-ancestors 'self'"
)


def _host_name(host: str) -> str:
    if host.startswith("["):
        return host.split("]")[0] + "]"
    return host.split(":")[0]


def _bad(message: str, code: str = "ungueltig", status: int = 400) -> ArchiveError:
    return ArchiveError(message, code, status)


def _csv_response(text: str, filename: str) -> Response:
    return Response(
        text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


def create_app(
    state: AppState,
    token: str,
    *,
    ui_dir: Path | None = None,
    extra_hosts: set[str] | None = None,
    request_exit=None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await state.boot_safe()
        yield
        await state.shutdown()

    app = FastAPI(
        title="Save Your Documents",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.syd = state
    hosts = LOCAL_HOSTS | (extra_hosts or set())
    token_b = token.encode()

    # --- Schutzschichten ------------------------------------------------------------

    def token_ok(given: str | None) -> bool:
        return bool(given) and hmac.compare_digest(given.encode(), token_b)

    def origin_ok(origin: str | None, host: str) -> bool:
        if not origin:
            return True
        return origin in CORS_ORIGINS or origin == f"http://{host}"

    @app.middleware("http")
    async def guard(request: Request, call_next):
        path = request.url.path
        host = request.headers.get("host", "")
        if _host_name(host) not in hosts:
            return JSONResponse({"code": "host", "message": "Nicht erlaubt."}, status_code=403)
        if request.method != "OPTIONS" and path.startswith("/api/"):
            if not origin_ok(request.headers.get("origin"), host):
                return JSONResponse(
                    {"code": "origin", "message": "Nicht erlaubt."}, status_code=403
                )
            if path not in OPEN_PATHS:
                given = request.headers.get("x-syd-token") or request.query_params.get("token")
                if not token_ok(given):
                    return JSONResponse(
                        {"code": "nicht_angemeldet", "message": "Zugriff verweigert."},
                        status_code=401,
                    )
                if state.state != "ready" and not path.startswith(UNLOCKED_PATHS):
                    code = "einrichtung" if state.state == "setup" else "gesperrt"
                    return JSONResponse(
                        {"code": code, "message": "Das Archiv ist gesperrt.", "state": state.state},
                        status_code=423,
                    )
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        if path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        else:
            response.headers.setdefault("Content-Security-Policy", UI_CSP)
            response.headers["Cache-Control"] = "no-cache"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["X-SYD-Token", "Content-Type"],
        max_age=600,
    )

    @app.exception_handler(ArchiveError)
    async def archive_error(_: Request, exc: ArchiveError):
        return JSONResponse(
            {"code": exc.code, "message": exc.message, **exc.extra}, status_code=exc.status
        )

    @app.exception_handler(RequestValidationError)
    async def invalid(_: Request, exc: RequestValidationError):
        return JSONResponse(
            {
                "code": "ungueltig",
                "message": "Die Eingabe ist unvollständig oder hat ein falsches Format.",
            },
            status_code=422,
        )

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        return JSONResponse(
            {"code": "fehler", "message": str(exc.detail)}, status_code=exc.status_code
        )

    @app.exception_handler(KeyError)
    async def missing(_: Request, exc: KeyError):
        return JSONResponse(
            {"code": "nicht_gefunden", "message": "Das wurde nicht gefunden."}, status_code=404
        )

    @app.exception_handler(Exception)
    async def crash(_: Request, exc: Exception):
        log.error("request_failed type=%s", type(exc).__name__)
        return JSONResponse(
            {"code": "intern", "message": "Etwas ist schiefgelaufen. Die Daten sind unverändert."},
            status_code=500,
        )

    # --- Status, Einrichtung, Sperre -------------------------------------------------

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/status")
    def status():
        return state.public_status()

    @app.post("/api/setup/create")
    async def setup_create(body: dict = Body(...)):
        return await state.setup_create(
            str(body.get("mode", "")), body.get("password"), body.get("vault_dir") or None
        )

    @app.post("/api/setup/confirm")
    async def setup_confirm(body: dict = Body(...)):
        return await state.setup_confirm(str(body.get("secret", "")))

    @app.post("/api/setup/open-existing")
    async def setup_open(body: dict = Body(...)):
        return await state.setup_open_existing(
            str(body.get("path", "")), str(body.get("secret", ""))
        )

    @app.post("/api/unlock")
    async def unlock(body: dict = Body(...)):
        return await state.unlock(str(body.get("secret", "")))

    @app.post("/api/lock")
    async def lock():
        await state.lock()
        return {"state": state.state}

    @app.post("/api/security/password")
    async def change_password(body: dict = Body(...)):
        await state.change_password(str(body.get("current", "")), str(body.get("new", "")))
        return {"ok": True}

    @app.post("/api/security/key/prepare")
    async def key_prepare(body: dict = Body(...)):
        return await state.prepare_new_key(str(body.get("current", "")))

    @app.post("/api/security/key/apply")
    async def key_apply(body: dict = Body(...)):
        await state.apply_new_key(str(body.get("secret", "")))
        return {"ok": True}

    @app.post("/api/shutdown")
    def shutdown():
        if request_exit:
            request_exit()
        return {"ok": True}

    @app.websocket("/api/events")
    async def events(ws: WebSocket):
        host = ws.headers.get("host", "")
        if (
            _host_name(host) not in hosts
            or not origin_ok(ws.headers.get("origin"), host)
            or not token_ok(ws.query_params.get("token"))
        ):
            await ws.close(code=4401)
            return
        await ws.accept()
        q = state.hub.subscribe()

        async def pump() -> None:
            await ws.send_json({"type": "hello", "state": state.state})
            while True:
                await ws.send_json(await q.get())

        async def watch_disconnect() -> None:
            while True:
                await ws.receive_text()

        tasks = [asyncio.ensure_future(pump()), asyncio.ensure_future(watch_disconnect())]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            state.hub.unsubscribe(q)

    # --- Startseite, Jobs ------------------------------------------------------------

    def _warnings() -> list[dict]:
        out = []
        if state.integrity.get("ok") is False:
            out.append(
                {
                    "code": "integritaet",
                    "message": "Die Prüfung des Archivs hat einen Fehler gefunden."
                    " Bitte eine Sicherung einspielen.",
                }
            )
        if state.backup_error:
            out.append({"code": "sicherung", "message": state.backup_error})
        elif not state.cfg.last_backup:
            out.append({"code": "keine_sicherung", "message": "Es gibt noch keine Sicherung."})
        info = backups.storage_info(state.vault.path, state.paths.backups(state.cfg))
        out += [{"code": "speicher", "message": m} for m in info["warnings"]]
        ls = state.ls.status()
        if ls["enabled"] and ls["error"] == "port_belegt":
            out.append(
                {
                    "code": "localsend_port",
                    "message": f"Der Empfang vom Handy ist blockiert: Der Port {ls['port']} wird"
                    " schon von einem anderen Programm benutzt (z. B. der LocalSend-App).",
                }
            )
        return out

    @app.get("/api/dashboard")
    def dashboard():
        d = state.repo.dashboard()
        d["reminders"] = state.deadlines.due_reminders()
        d["jobs"] = state.jobs.counts()
        d["incoming"] = state.ls.pending_requests()
        d["warnings"] = _warnings()
        return d

    @app.get("/api/jobs")
    def jobs():
        rows = state.vault.rows(
            "SELECT j.id, j.document_id, j.state, j.error_code, j.attempts FROM job j"
            " WHERE j.state IN ('wartend','laeuft','fehler') ORDER BY j.id DESC LIMIT 100"
        )
        return {"counts": state.jobs.counts(), "items": rows, "current": state.jobs.current}

    # --- Dokumente -------------------------------------------------------------------

    def _ids(value: str | None) -> list[int] | None:
        if not value:
            return None
        try:
            return [int(x) for x in value.split(",") if x.strip()]
        except ValueError as exc:
            raise _bad("Ungültige Liste.") from exc

    @app.get("/api/documents")
    def list_documents(
        q: str | None = None,
        company_id: int | None = None,
        doc_type: str | None = None,
        category_id: int | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        amount_min: int | None = None,
        amount_max: int | None = None,
        tag_ids: str | None = None,
        paid: bool | None = None,
        state_: str | None = Query(None, alias="state"),
        archived: str = "nein",
        sort: str = "datum_ab",
        limit: int = Query(50, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        return state.repo.list_documents(
            q=q, company_id=company_id, doc_type=doc_type, category_id=category_id,
            date_from=date_from, date_to=date_to, amount_min=amount_min, amount_max=amount_max,
            tag_ids=_ids(tag_ids), paid=paid, state=state_, archived=archived, sort=sort,
            limit=limit, offset=offset,
        )  # fmt: skip

    @app.post("/api/documents/confirm-batch")
    def confirm_batch(body: dict = Body(default_factory=dict)):
        result = state.repo.batch_confirm(body.get("ids"))
        state.hub.publish("documents.changed")
        state.hub.publish("reminders.changed")
        return result

    def _detail(doc_id: int) -> dict:
        d = state.repo.get_document(doc_id)
        d["deadlines"] = state.deadlines.suggestions(doc_id)
        d["links"] = state.linking.links(doc_id)
        d["job"] = state.vault.row(
            "SELECT state, error_code FROM job WHERE document_id = ? ORDER BY id DESC LIMIT 1",
            (doc_id,),
        )
        return d

    @app.get("/api/documents/{doc_id}")
    def get_document(doc_id: int):
        return _detail(doc_id)

    @app.patch("/api/documents/{doc_id}")
    def update_document(doc_id: int, body: dict = Body(...)):
        state.repo.update_document(doc_id, body)
        state.hub.publish("documents.changed", document_id=doc_id)
        return _detail(doc_id)

    @app.post("/api/documents/{doc_id}/confirm")
    def confirm_document(doc_id: int, body: dict = Body(...)):
        state.repo.confirm_document(
            doc_id,
            body.get("fields") or {},
            company_name=body.get("company_name"),
            create_company=bool(body.get("create_company")),
            references=body.get("references"),
            deadlines=body.get("deadlines"),
        )
        state.hub.publish("documents.changed", document_id=doc_id)
        state.hub.publish("reminders.changed")
        return _detail(doc_id)

    @app.post("/api/documents/{doc_id}/archive")
    def archive_document(doc_id: int, body: dict = Body(...)):
        state.repo.archive_document(doc_id, str(body.get("reason", "")))
        state.hub.publish("documents.changed", document_id=doc_id)
        return _detail(doc_id)

    @app.post("/api/documents/{doc_id}/restore")
    def restore_document(doc_id: int):
        state.repo.restore_document(doc_id)
        state.hub.publish("documents.changed", document_id=doc_id)
        return _detail(doc_id)

    @app.post("/api/documents/{doc_id}/paid")
    def set_paid(doc_id: int, body: dict = Body(...)):
        state.repo.set_paid(doc_id, bool(body.get("paid")), body.get("paid_at"))
        state.hub.publish("reminders.changed")
        return _detail(doc_id)

    @app.put("/api/documents/{doc_id}/tags")
    def set_tags(doc_id: int, body: dict = Body(...)):
        return {"tags": state.repo.set_document_tags(doc_id, list(body.get("tag_ids") or []))}

    @app.put("/api/documents/{doc_id}/references")
    def set_references(doc_id: int, body: dict = Body(...)):
        state.repo.get_document(doc_id)
        state.repo.set_references(doc_id, list(body.get("references") or []))
        return {"references": state.repo.document_references(doc_id)}

    @app.post("/api/documents/{doc_id}/reprocess")
    def reprocess(doc_id: int):
        state.repo.get_document(doc_id)
        state.jobs.enqueue(doc_id)
        return {"queued": True}

    @app.get("/api/documents/{doc_id}/text")
    def document_text(doc_id: int):
        state.repo.get_document(doc_id)
        return {
            "pages": state.vault.rows(
                "SELECT page, text, confidence FROM ocr_text WHERE document_id = ? ORDER BY page",
                (doc_id,),
            )
        }

    def _stream(doc_id: int, part: int) -> Iterator[bytes]:
        yield from state.vault.stream_page(doc_id, part)

    @app.get("/api/documents/{doc_id}/parts/{part}/file")
    def part_file(doc_id: int, part: int, download: bool = False):
        row = state.vault.row(
            "SELECT mime, name, size FROM blob_store WHERE document_id = ? AND page = ?",
            (doc_id, part),
        )
        if not row:
            raise NotFoundError("Die Datei")
        disposition = "attachment" if download else "inline"
        fname = quote(row["name"] or "datei")
        return StreamingResponse(
            _stream(doc_id, part),
            media_type=row["mime"],
            headers={
                "Content-Length": str(row["size"]),
                "Content-Disposition": f"{disposition}; filename*=UTF-8''{fname}",
            },
        )

    @app.get("/api/documents/{doc_id}/thumbnails/{page}")
    def thumbnail(doc_id: int, page: int):
        row = state.vault.row(
            "SELECT image FROM thumbnail WHERE document_id = ? AND page = ?", (doc_id, page)
        )
        if not row:
            raise NotFoundError("Die Vorschau")
        return Response(
            row["image"],
            media_type="image/jpeg",
            headers={"Cache-Control": "private, max-age=3600"},
        )

    # --- Fristen, Erinnerungen, Verknuepfungen --------------------------------------------

    @app.post("/api/documents/{doc_id}/deadlines")
    def create_deadline(doc_id: int, body: dict = Body(...)):
        d = state.deadlines.create(doc_id, body)
        state.hub.publish("reminders.changed")
        return d

    @app.patch("/api/deadlines/{dl_id}")
    def update_deadline(dl_id: int, body: dict = Body(...)):
        d = state.deadlines.update(dl_id, body)
        state.hub.publish("reminders.changed")
        return d

    @app.delete("/api/deadlines/{dl_id}")
    def delete_deadline(dl_id: int):
        state.deadlines.delete(dl_id)
        state.hub.publish("reminders.changed")
        return {"ok": True}

    @app.post("/api/deadlines/{dl_id}/complete")
    def complete_deadline(dl_id: int, body: dict = Body(default_factory=dict)):
        d = state.deadlines.complete(dl_id, bool(body.get("done", True)))
        state.hub.publish("reminders.changed")
        return d

    @app.get("/api/deadlines")
    def list_deadlines(
        within_days: int | None = Query(None, ge=0, le=3650),
        include_overdue: bool = True,
        status_: str | None = Query("offen", alias="status"),
        type_: str | None = Query(None, alias="type"),
    ):
        if type_ and type_ not in DEADLINE_TYPES:
            raise _bad("Unbekannte Fristart.")
        return {
            "items": state.deadlines.list(
                within_days=within_days,
                include_overdue=include_overdue,
                status=status_ or None,
                dtype=type_,
            )
        }

    @app.get("/api/reminder-defaults")
    def get_reminder_defaults():
        return state.deadlines.all_defaults()

    @app.put("/api/reminder-defaults")
    def put_reminder_defaults(body: dict = Body(...)):
        for dtype, leads in body.items():
            state.deadlines.set_default_leads(dtype, leads)
        return state.deadlines.all_defaults()

    @app.get("/api/reminders")
    def reminders():
        return {"items": state.deadlines.due_reminders()}

    @app.post("/api/reminders/tick")
    def reminders_tick():
        res = state.deadlines.tick()
        state.hub.publish("reminders.changed")
        return res

    @app.get("/api/reminders/notifications")
    def reminder_notifications():
        return {"items": state.deadlines.take_notifications()}

    @app.post("/api/reminders/{rid}/dismiss")
    def dismiss_reminder(rid: int):
        state.deadlines.dismiss(rid)
        state.hub.publish("reminders.changed")
        return {"ok": True}

    @app.post("/api/reminders/{rid}/snooze")
    def snooze_reminder(rid: int, body: dict = Body(...)):
        state.deadlines.snooze(rid, body.get("days"))
        state.hub.publish("reminders.changed")
        return {"ok": True}

    @app.post("/api/links")
    def create_link(body: dict = Body(...)):
        return state.linking.create(
            int(body.get("from_id", 0)), int(body.get("to_id", 0)), str(body.get("link_type", ""))
        )

    @app.post("/api/links/{link_id}/confirm")
    def confirm_link(link_id: int, body: dict = Body(default_factory=dict)):
        state.linking.confirm(link_id, body.get("link_type"))
        state.hub.publish("reminders.changed")
        return {"ok": True}

    @app.post("/api/links/{link_id}/reject")
    def reject_link(link_id: int):
        state.linking.reject(link_id)
        return {"ok": True}

    @app.delete("/api/links/{link_id}")
    def remove_link(link_id: int):
        state.linking.remove(link_id)
        state.hub.publish("reminders.changed")
        return {"ok": True}

    # --- Stammdaten --------------------------------------------------------------------

    @app.get("/api/meta")
    def meta():
        return {
            "doc_types": list(DOC_TYPES),
            "deadline_types": list(DEADLINE_TYPES),
            "reference_types": list(REF_TYPES),
        }

    @app.get("/api/companies")
    def companies():
        return {"items": state.repo.list_companies()}

    @app.get("/api/companies/similar")
    def similar(name: str):
        return {"items": state.repo.similar_companies(name)}

    @app.post("/api/companies")
    def create_company(body: dict = Body(...)):
        return state.repo.create_company(str(body.get("name", "")))

    @app.patch("/api/companies/{cid}")
    def rename_company(cid: int, body: dict = Body(...)):
        return state.repo.rename_company(cid, str(body.get("name", "")))

    @app.post("/api/companies/{cid}/aliases")
    def add_alias(cid: int, body: dict = Body(...)):
        state.repo.add_alias(cid, str(body.get("alias", "")))
        return state.repo.get_company(cid)

    @app.post("/api/companies/{cid}/merge")
    def merge_companies(cid: int, body: dict = Body(...)):
        res = state.repo.merge_companies(cid, int(body.get("target_id", 0)))
        state.hub.publish("documents.changed")
        return res

    @app.get("/api/categories")
    def categories():
        return {"items": state.repo.list_categories()}

    @app.post("/api/categories")
    def create_category(body: dict = Body(...)):
        return state.repo.create_category(str(body.get("name", "")), body.get("parent_id"))

    @app.get("/api/tags")
    def tags():
        return {"items": state.repo.list_tags()}

    @app.post("/api/tags")
    def create_tag(body: dict = Body(...)):
        return state.repo.create_tag(str(body.get("name", "")), body.get("color") or "#3b82f6")

    @app.patch("/api/tags/{tid}")
    def update_tag(tid: int, body: dict = Body(...)):
        return state.repo.update_tag(tid, body.get("name"), body.get("color"))

    @app.delete("/api/tags/{tid}")
    def delete_tag(tid: int):
        state.repo.delete_tag(tid)
        return {"ok": True}

    # --- Import ------------------------------------------------------------------------

    @app.post("/api/import/upload")
    async def upload(request: Request):
        form = await request.form(max_files=200, max_fields=20)
        files: list[tuple[str, bytes]] = []
        for item in form.getlist("files"):
            if hasattr(item, "read"):
                files.append((item.filename or "datei", await item.read()))
        result = await run_in_threadpool(state.importer.stage_uploads, files)
        if result["batch_id"]:
            state.hub.publish("import.received", batch_id=result["batch_id"])
        return result

    @app.get("/api/import/pending")
    def pending():
        return {"items": state.importer.pending()}

    @app.get("/api/import/files/{file_id}")
    def import_file(file_id: int):
        data, mime = state.importer.file_bytes(file_id)
        return Response(data, media_type=mime)

    @app.post("/api/import/{batch_id}/commit")
    def commit(batch_id: int, body: dict = Body(...)):
        res = state.importer.commit(batch_id, body.get("groups") or [], body.get("discard") or [])
        state.jobs.notify()
        state.hub.publish("documents.changed")
        return res

    # --- LocalSend ---------------------------------------------------------------------

    @app.get("/api/incoming")
    def incoming():
        return {"items": state.ls.pending_requests(), "status": state.ls.status()}

    @app.post("/api/incoming/{req_id}/decide")
    def decide(req_id: str, body: dict = Body(...)):
        if not state.ls.decide(req_id, bool(body.get("accept")), bool(body.get("trust"))):
            raise NotFoundError("Die Anfrage")
        return {"ok": True}

    @app.get("/api/trusted-devices")
    def trusted():
        return {
            "items": state.vault.rows(
                "SELECT id, alias, trusted_since FROM trusted_device ORDER BY alias"
            )
        }

    @app.delete("/api/trusted-devices/{did}")
    def untrust(did: int):
        state.vault.execute("DELETE FROM trusted_device WHERE id = ?", (did,))
        state.vault.audit("device.untrusted")
        state.ls.refresh()
        return {"ok": True}

    @app.get("/api/firewall")
    def firewall_status():
        return {
            "supported": firewall.supported(),
            "rule": firewall.rule_exists(),
            "port": state.ls.port,
        }

    @app.post("/api/firewall/allow")
    async def firewall_allow():
        res = await run_in_threadpool(firewall.add_rule, state.ls.port)
        if res.get("error") == "nur_windows":
            raise _bad("Die Firewall-Regel gibt es nur unter Windows.", "nur_windows", 501)
        return res

    # --- Auswertung --------------------------------------------------------------------

    def _stats(group_by, date_from, date_to, doc_types, company_id, category_id, paid):
        types = None if doc_types is None else [t for t in doc_types.split("|") if t]
        return stats.stats(
            state.repo, group_by=group_by, date_from=date_from, date_to=date_to,
            doc_types=types, company_id=company_id, category_id=category_id, paid=paid,
        )  # fmt: skip

    @app.get("/api/stats")
    def get_stats(
        group_by: str = "firma",
        date_from: str | None = None,
        date_to: str | None = None,
        doc_types: str | None = None,
        company_id: int | None = None,
        category_id: int | None = None,
        paid: bool | None = None,
    ):
        return _stats(group_by, date_from, date_to, doc_types, company_id, category_id, paid)

    @app.get("/api/stats.csv")
    def get_stats_csv(
        group_by: str = "firma",
        date_from: str | None = None,
        date_to: str | None = None,
        doc_types: str | None = None,
        company_id: int | None = None,
        category_id: int | None = None,
        paid: bool | None = None,
    ):
        res = _stats(group_by, date_from, date_to, doc_types, company_id, category_id, paid)
        return _csv_response(stats.to_csv(res), f"auswertung-{group_by}.csv")

    # --- Export ------------------------------------------------------------------------

    @app.get("/api/export/templates")
    def export_templates():
        return {"items": state.exporter.templates()}

    @app.post("/api/export/templates")
    def save_template(body: dict = Body(...)):
        return state.exporter.save_template(
            str(body.get("name", "")),
            str(body.get("path_template", "")),
            str(body.get("file_template", "")),
            bool(body.get("include_archived")),
            body.get("id"),
        )

    @app.delete("/api/export/templates/{tid}")
    def delete_template(tid: int):
        state.exporter.delete_template(tid)
        return {"ok": True}

    def _plan(body: dict) -> list[dict]:
        flt = {k: v for k, v in (body.get("filters") or {}).items() if k in EXPORT_FILTERS}
        return state.exporter.plan(
            body.get("template_id"),
            path_template=body.get("path_template"),
            file_template=body.get("file_template"),
            include_archived=body.get("include_archived"),
            include_unreviewed=bool(body.get("include_unreviewed")),
            document_ids=body.get("document_ids"),
            filters=flt,
        )

    @app.post("/api/export/plan")
    def export_plan(body: dict = Body(...)):
        plan = _plan(body)
        return {"items": plan[:200], "total": len(plan)}

    @app.post("/api/export/run")
    def export_run(body: dict = Body(...)):
        raw = str(body.get("destination", "")).strip()
        if not raw or not Path(raw).is_absolute():
            raise _bad("Bitte einen vollständigen Zielordner angeben.", "ziel_ungueltig")
        res = state.exporter.run(_plan(body), Path(raw), as_zip=bool(body.get("as_zip")))
        state.vault.audit("export.done")
        return res

    @app.post("/api/export/download")
    def export_download(body: dict = Body(...)):
        plan = _plan(body)
        tmp = Path(tempfile.mkdtemp(prefix="syd-export-"))
        target = tmp / "export.zip"
        try:
            state.exporter.run(plan, target, as_zip=True)
        except Exception:
            target.unlink(missing_ok=True)
            tmp.rmdir()
            raise
        state.vault.audit("export.done")

        def cleanup() -> None:
            target.unlink(missing_ok=True)
            tmp.rmdir()

        return FileResponse(
            target,
            media_type="application/zip",
            filename=f"dokumente-{datetime.now():%Y-%m-%d}.zip",
            background=BackgroundTask(cleanup),
        )

    # --- Einstellungen, System ----------------------------------------------------------

    @app.get("/api/settings")
    def get_settings():
        return state.repo.get_settings()

    @app.put("/api/settings")
    async def put_settings(body: dict = Body(...)):
        body = dict(body)
        body.pop("developer_mode", None)  # nur ueber /api/dev/enable|disable
        old = state.repo.get_settings()
        new = await run_in_threadpool(state.repo.update_settings, body)
        if old["localsend_enabled"] != new["localsend_enabled"]:
            await state.ls.restart()
        else:
            state.ls.refresh()
        return new

    @app.get("/api/system")
    def system():
        s = state.repo.get_settings()
        bdir = state.paths.backups(state.cfg)
        return {
            "version": __version__,
            "ocr": ocr.status(),
            "ollama": ollama.status(s["ollama_url"]) if s["ollama_enabled"] else None,
            "storage": backups.storage_info(state.vault.path, bdir),
            "backups": backups.list_backups(bdir),
            "backup_keep": state.cfg.backup_keep,
            "last_backup": state.cfg.last_backup,
            "backup_error": state.backup_error,
            "integrity": state.integrity,
            "localsend": state.ls.status(),
            "mode": state.cfg.mode,
            "key_store": state.public_status()["key_store"],
        }

    @app.post("/api/system/backup")
    async def backup_now():
        res = await run_in_threadpool(state.backup_now)
        if not res["ok"]:
            raise _bad(res["error"], "sicherung_fehlgeschlagen", 500)
        return res

    @app.put("/api/system/backup-config")
    def backup_config(body: dict = Body(...)):
        keep = body.get("backup_keep", state.cfg.backup_keep)
        if not isinstance(keep, int) or not 1 <= keep <= 60:
            raise _bad("Anzahl der Sicherungen zwischen 1 und 60.")
        folder = body.get("backup_dir")
        if folder:
            p = Path(folder)
            if not p.is_absolute() or not p.parent.exists():
                raise _bad("Dieser Sicherungsordner ist nicht erreichbar.", "ordner_fehlt")
            try:
                p.mkdir(exist_ok=True)
            except OSError as exc:
                raise _bad(
                    "Dieser Sicherungsordner ist nicht beschreibbar.", "ordner_fehlt"
                ) from exc
            state.cfg.backup_dir = str(p)
        elif "backup_dir" in body:
            state.cfg.backup_dir = None
        state.cfg.backup_keep = keep
        state.cfg.save(state.paths.root)
        return {"ok": True}

    @app.post("/api/system/integrity-check")
    async def integrity():
        return await run_in_threadpool(state.integrity_now)

    # --- Protokolle ---------------------------------------------------------------------

    def _check_day(day: str) -> None:
        try:
            datetime.strptime(day, "%Y-%m-%d")
        except ValueError as exc:
            raise _bad("Ungültiger Tag.") from exc

    @app.get("/api/audit/days")
    def audit_days():
        return {"items": state.vault.audit_days()}

    @app.get("/api/audit/{day}")
    def audit_day(day: str):
        _check_day(day)
        return {"items": state.vault.audit_day(day)}

    @app.get("/api/audit/{day}/export.csv")
    def audit_csv(day: str):
        _check_day(day)
        out = io.StringIO()
        w = csv.writer(out, delimiter=";")
        w.writerow(["Zeit", "Ereignis", "Dokument", "Stapel", "Gerät", "Feld"])
        for r in state.vault.audit_day(day):
            w.writerow(
                [
                    r["ts"],
                    r["event"],
                    r["document_id"] or "",
                    r["batch_id"] or "",
                    r["device_id"] or "",
                    r["field"] or "",
                ]
            )
        return _csv_response("\ufeff" + out.getvalue(), f"protokoll-{day}.csv")

    @app.get("/api/logs")
    def list_logs():
        return {"items": logs.list_logs(state.paths.logs)}

    @app.get("/api/logs/{name}")
    def read_log(name: str):
        try:
            text = logs.read_log(state.paths.logs, name)
        except (ValueError, OSError) as exc:
            raise NotFoundError("Die Protokolldatei") from exc
        return Response(text, media_type="text/plain; charset=utf-8")

    # --- Entwicklerwerkzeuge (Schalter mit erneuter Passwort-/Schluesseleingabe) ----------

    def _dev() -> None:
        if not state.repo.get_setting("developer_mode"):
            raise _bad("Die Entwicklerwerkzeuge sind ausgeschaltet.", "dev_aus", 403)

    @app.post("/api/dev/enable")
    def dev_enable(body: dict = Body(...)):
        if not state.verify_secret(str(body.get("secret", ""))):
            raise _bad("Schlüssel oder Passwort stimmt nicht.", "falsches_geheimnis", 401)
        state.repo.update_settings({"developer_mode": True})
        return {"developer_mode": True}

    @app.post("/api/dev/disable")
    def dev_disable():
        state.repo.update_settings({"developer_mode": False})
        return {"developer_mode": False}

    @app.get("/api/dev/info")
    def dev_info():
        _dev()
        v = state.vault
        tables = (
            "document", "blob_store", "deadline", "reminder", "extraction", "job",
            "audit_log", "company", "tag", "import_file",
        )  # fmt: skip
        return {
            "version": __version__,
            "schema_version": v.schema_version,
            "data_dir": str(state.paths.root),
            "vault_path": str(v.path),
            "tables": {t: v.scalar(f"SELECT count(*) FROM {t}") for t in tables},
            "jobs": state.jobs.counts(),
            "ocr": ocr.status(),
            "localsend": state.ls.status(),
            "failed_jobs": v.rows(
                "SELECT id, document_id, error_code, attempts FROM job WHERE state = 'fehler'"
                " ORDER BY id DESC LIMIT 50"
            ),
        }

    @app.post("/api/dev/reprocess-failed")
    def dev_reprocess_failed():
        _dev()
        rows = state.vault.rows("SELECT DISTINCT document_id FROM job WHERE state = 'fehler'")
        for r in rows:
            state.jobs.enqueue(r["document_id"])
        return {"queued": len(rows)}

    # --- Oberflaeche ---------------------------------------------------------------------

    if ui_dir and (ui_dir / "index.html").exists():
        root = ui_dir.resolve()

        @app.get("/{full_path:path}", include_in_schema=False)
        def ui(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(404, "Nicht gefunden.")
            candidate = (root / full_path).resolve()
            if full_path and candidate.is_file() and candidate.is_relative_to(root):
                return FileResponse(candidate)
            return FileResponse(root / "index.html")

    return app

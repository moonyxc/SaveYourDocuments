"""Ereignisverteiler (WebSocket) und persistente Aufgabenwarteschlange."""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import Callable

from .util import now_iso
from .vault import Vault

log = logging.getLogger("syd.jobs")


class EventHub:
    """Verteilt kleine Ereignisse (nur Typ und IDs) an verbundene Oberflaechen."""

    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.subscribers: set[asyncio.Queue] = set()

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def publish(self, type_: str, **data) -> None:
        event = {"type": type_, **data}
        if self.loop is None or self.loop.is_closed():
            return
        self.loop.call_soon_threadsafe(self._deliver, event)

    def _deliver(self, event: dict) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                self.subscribers.discard(q)


class JobQueue:
    """Arbeitet `job`-Zeilen nacheinander ab. Ueberlebt Neustarts (laeuft -> wartend)."""

    def __init__(self, vault: Vault, handler: Callable[[int], dict], hub: EventHub | None = None):
        self.v = vault
        self.handler = handler
        self.hub = hub
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.current: int | None = None

    def start(self) -> None:
        self.v.execute("UPDATE job SET state = 'wartend' WHERE state = 'laeuft'")
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="syd-jobs", daemon=True)
        self._thread.start()
        self._wake.set()

    def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout)

    def notify(self) -> None:
        self._wake.set()

    def enqueue(self, document_id: int, kind: str = "process") -> int:
        cur = self.v.execute(
            "INSERT INTO job (document_id, kind, state, created_at, updated_at) VALUES (?,?,'wartend',?,?)",
            (document_id, kind, now_iso(), now_iso()),
        )
        self._wake.set()
        return cur.lastrowid

    def counts(self) -> dict:
        rows = self.v.rows("SELECT state, count(*) AS n FROM job GROUP BY state")
        out = {"wartend": 0, "laeuft": 0, "fertig": 0, "fehler": 0}
        out.update({r["state"]: r["n"] for r in rows})
        return out

    def _next(self) -> dict | None:
        return self.v.row(
            "SELECT id, document_id, kind FROM job WHERE state = 'wartend' ORDER BY id LIMIT 1"
        )

    def run_pending(self) -> int:
        """Arbeitet alle wartenden Jobs synchron ab (fuer Tests und Skripte)."""
        n = 0
        while (job := self._next()) is not None:
            self._process(job)
            n += 1
        return n

    def _process(self, job: dict) -> None:
        self.v.execute(
            "UPDATE job SET state = 'laeuft', attempts = attempts + 1, updated_at = ? WHERE id = ?",
            (now_iso(), job["id"]),
        )
        self.current = job["document_id"]
        self._emit("job.started", job["document_id"])
        code = None
        try:
            result = self.handler(job["document_id"])
            code = result.get("error")
        except Exception as exc:
            code = "interner_fehler"
            log.error("job_failed id=%d type=%s", job["id"], type(exc).__name__)
        finally:
            self.current = None
        self.v.execute(
            "UPDATE job SET state = ?, error_code = ?, updated_at = ? WHERE id = ?",
            ("fehler" if code else "fertig", code, now_iso(), job["id"]),
        )
        self._emit("job.finished", job["document_id"], error=code)

    def _emit(self, type_: str, document_id: int, **extra) -> None:
        if self.hub:
            self.hub.publish(type_, document_id=document_id, **extra)

    def _run(self) -> None:
        while not self._stop.is_set():
            job = None
            try:
                job = self._next()
            except Exception:
                log.error("job_poll_failed")
            if job is None:
                self._wake.wait(timeout=5)
                self._wake.clear()
                continue
            try:
                self._process(job)
            except Exception as exc:
                log.error("job_loop_error type=%s", type(exc).__name__)
                self._stop.wait(1)

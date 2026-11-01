"""Lebenszyklus der Anwendung: Einrichtung, Sperre, laufende Dienste, Hintergrundaufgaben."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from pathlib import Path

from . import backups, keystore
from .config import AppConfig, Paths
from .deadlines import Deadlines
from .exporter import Exporter
from .extract import ocr
from .extract.pipeline import process_document
from .imports import ImportService
from .jobs import EventHub, JobQueue
from .linking import Linking
from .lsservice import LocalSendService
from .repo import ArchiveError, Repo
from .vault import (
    Vault,
    VaultError,
    VaultMissingError,
    WrongKeyError,
    format_recovery_key,
    generate_key,
    parse_recovery_key,
)

log = logging.getLogger("syd.state")

MIN_PASSWORD = 8
BACKUP_EVERY = timedelta(hours=24)
INTEGRITY_EVERY = timedelta(days=7)


def _bad(message: str, code: str = "ungueltig", status: int = 400, **extra) -> ArchiveError:
    return ArchiveError(message, code, status, **extra)


def _age_ok(stamp: str | None, every: timedelta) -> bool:
    if not stamp:
        return False
    try:
        return datetime.now() - datetime.fromisoformat(stamp) < every
    except ValueError:
        return False


class AppState:
    def __init__(
        self,
        paths: Paths,
        *,
        localsend_port: int | None = None,
        multicast: bool = True,
        recognise: Callable = ocr.recognise,
        today: Callable[[], date] = date.today,
        background: bool = True,
        tick_seconds: float = 60.0,
    ):
        from .localsend import DEFAULT_PORT

        self.paths = paths
        self.cfg = AppConfig.load(paths.root)
        self.hub = EventHub()
        self.recognise = recognise
        self.today = today
        self.background = background
        self.tick_seconds = tick_seconds
        self.localsend_port = localsend_port or DEFAULT_PORT
        self.multicast = multicast
        self.vault: Vault | None = None
        self.state = "setup"
        self.reason: str | None = None
        self._pending: dict | None = None
        self._pending_key: bytes | None = None
        self._tasks: list[asyncio.Task] = []
        self.integrity: dict = {"ok": None, "at": self.cfg.last_integrity_check}
        self.backup_error: str | None = None
        self.repo: Repo
        self.deadlines: Deadlines
        self.linking: Linking
        self.importer: ImportService
        self.exporter: Exporter
        self.jobs: JobQueue
        self.ls: LocalSendService
        self._lock = asyncio.Lock()

    # --- Start ---------------------------------------------------------------------

    async def boot_safe(self) -> None:
        try:
            await self.boot()
        except VaultError as exc:
            log.warning("boot_locked type=%s", type(exc).__name__)

    async def boot(self) -> None:
        self.hub.bind(asyncio.get_running_loop())
        if not self.cfg.setup_done:
            self.state, self.reason = "setup", None
            return
        if self.cfg.mode == "key":
            try:
                key = keystore.load_key(self.paths.key_file)
            except keystore.KeyStoreError:
                self.state, self.reason = "locked", "schluessel_fehlt"
                return
            await self._open_and_activate(key, store=False)
            return
        self.state, self.reason = "locked", "passwort"

    async def _open_and_activate(self, key, *, store: bool) -> None:
        path = self.paths.vault(self.cfg)
        try:
            vault = await asyncio.to_thread(Vault.open, path, key)
        except VaultMissingError:
            self.state, self.reason = "locked", "archiv_fehlt"
            raise
        except WrongKeyError:
            self.state, self.reason = "locked", "schluessel_falsch"
            raise
        if store and isinstance(key, bytes):
            keystore.store_key(self.paths.key_file, key)
        self.vault = vault
        await self._activate()

    async def _activate(self) -> None:
        v = self.vault
        assert v is not None
        self.repo = Repo(v, today=self.today)
        self.repo.ensure_defaults()
        self.deadlines = Deadlines(self.repo)
        self.linking = Linking(self.repo)
        self.jobs = JobQueue(
            v,
            lambda did: self._process(did),
            self.hub,
        )
        self.importer = ImportService(
            self.repo, self.paths.staging, on_new_document=lambda _id: self.jobs.notify()
        )
        self.exporter = Exporter(self.repo)
        self.ls = LocalSendService(
            repo=self.repo,
            importer=self.importer,
            hub=self.hub,
            certs_dir=self.paths.certs,
            quarantine_dir=self.paths.staging / "localsend",
            port=self.localsend_port,
            multicast=self.multicast,
        )
        self.state, self.reason = "ready", None
        if self.background:
            self.jobs.start()
            self._tasks = [
                asyncio.create_task(self._scheduler(), name="syd-scheduler"),
                asyncio.create_task(self._maintenance(), name="syd-maintenance"),
            ]
            await self.ls.start()
        log.info("ready")

    def _process(self, document_id: int) -> dict:
        return process_document(
            self.repo, document_id, recognise=self.recognise, today=self.today()
        )

    async def shutdown(self) -> None:
        for t in self._tasks:
            t.cancel()
        for t in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t
        self._tasks = []
        self._discard_pending()
        if self.state == "ready":
            with contextlib.suppress(Exception):
                await self.ls.stop()
            await asyncio.to_thread(self.jobs.stop)
        if self.vault:
            with contextlib.suppress(Exception):
                self.vault.close()
        self.vault = None

    # --- Hintergrund ---------------------------------------------------------------

    async def _scheduler(self) -> None:
        while True:
            try:
                res = await asyncio.to_thread(self.deadlines.tick)
                if res.get("fired") or res.get("rolled"):
                    self.hub.publish("reminders.changed")
            except Exception as exc:
                log.error("scheduler_failed type=%s", type(exc).__name__)
            await asyncio.sleep(self.tick_seconds)

    async def _maintenance(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self.run_maintenance)
            except Exception as exc:
                log.error("maintenance_failed type=%s", type(exc).__name__)
            await asyncio.sleep(3600)

    def run_maintenance(self, force_backup: bool = False, force_check: bool = False) -> dict:
        out: dict = {}
        if force_backup or not _age_ok(self.cfg.last_backup, BACKUP_EVERY):
            out["backup"] = self.backup_now()
        if force_check or not _age_ok(self.cfg.last_integrity_check, INTEGRITY_EVERY):
            out["integrity"] = self.integrity_now()
        return out

    def backup_now(self) -> dict:
        assert self.vault is not None
        try:
            target = backups.make_backup(
                self.vault, self.paths.backups(self.cfg), self.cfg.backup_keep
            )
        except (OSError, VaultError) as exc:
            self.backup_error = "Die Sicherung konnte nicht geschrieben werden."
            log.error("backup_failed type=%s", type(exc).__name__)
            self.hub.publish("backup.failed")
            return {"ok": False, "error": self.backup_error}
        self.backup_error = None
        self.cfg.last_backup = datetime.now().isoformat(timespec="seconds")
        self.cfg.save(self.paths.root)
        self.vault.audit("backup.created")
        return {"ok": True, "name": target.name}

    def integrity_now(self) -> dict:
        assert self.vault is not None
        ok = self.vault.integrity_check()
        stamp = datetime.now().isoformat(timespec="seconds")
        self.integrity = {"ok": ok, "at": stamp}
        self.cfg.last_integrity_check = stamp
        self.cfg.save(self.paths.root)
        self.vault.audit("integrity.checked")
        if not ok:
            log.error("integrity_failed")
            self.hub.publish("integrity.failed")
        return self.integrity

    # --- Einrichtung ---------------------------------------------------------------

    def _discard_pending(self) -> None:
        pending = self._pending
        if not pending:
            return
        with contextlib.suppress(Exception):
            pending["vault"].close()
        self._pending = None
        self._move_aside(Path(pending["path"]))

    def _move_aside(self, path: Path) -> None:
        """Eine unfertige Archivdatei wird nie geloescht, nur beiseitegelegt."""
        side_suffixes = ("-wal", "-shm")
        sidecars = [path.with_name(path.name + suffix) for suffix in side_suffixes]
        if not path.exists() and not any(side.exists() for side in sidecars):
            return
        stamp = time.strftime("%Y%m%d-%H%M%S")
        sequence = 1
        while True:
            tag = stamp if sequence == 1 else f"{stamp}-{sequence}"
            targets = [
                path.with_name(f"{path.name}.unfertig-{tag}"),
                *(path.with_name(f"{path.name}{suffix}.unfertig-{tag}") for suffix in side_suffixes),
            ]
            if not any(target.exists() for target in targets):
                break
            sequence += 1
        if path.exists():
            path.rename(targets[0])
        for side_suffix in side_suffixes:
            side = path.with_name(path.name + side_suffix)
            if side.exists():
                side.rename(side.with_name(f"{side.name}.unfertig-{tag}"))

    async def setup_create(
        self, mode: str, password: str | None = None, vault_dir: str | None = None
    ) -> dict:
        async with self._lock:
            if self.cfg.setup_done or self.state == "ready":
                raise _bad(
                    "Die Einrichtung ist bereits abgeschlossen.", "bereits_eingerichtet", 409
                )
            if mode not in ("key", "password"):
                raise _bad("Bitte „Schlüssel“ oder „Passwort“ wählen.")
            if mode == "password" and (not password or len(password) < MIN_PASSWORD):
                raise _bad(f"Das Passwort braucht mindestens {MIN_PASSWORD} Zeichen.")
            path = self.paths.vault(self.cfg)
            if vault_dir:
                folder = Path(vault_dir)
                if not folder.is_dir():
                    raise _bad("Der gewählte Ordner existiert nicht.", "ordner_fehlt")
                path = folder / "archiv.syd"
            self._discard_pending()
            self._move_aside(path)
            secret: bytes | str = generate_key() if mode == "key" else password
            try:
                vault = await asyncio.to_thread(Vault.open, path, secret, create=True)
            except (OSError, VaultError) as exc:
                raise _bad(
                    "Am gewählten Ort kann kein Archiv angelegt werden.", "ordner_nicht_nutzbar"
                ) from exc
            self._pending = {"mode": mode, "secret": secret, "vault": vault, "path": str(path)}
            result: dict = {"mode": mode, "vault_path": str(path)}
            if mode == "key":
                result["recovery_key"] = format_recovery_key(secret)
            return result

    async def setup_confirm(self, secret: str) -> dict:
        async with self._lock:
            p = self._pending
            if not p:
                raise _bad("Es läuft keine Einrichtung.", "keine_einrichtung", 409)
            if not self._matches(p["secret"], secret):
                raise _bad(
                    "Das stimmt nicht mit dem angezeigten Schlüssel überein."
                    if p["mode"] == "key"
                    else "Die beiden Passwörter sind nicht gleich.",
                    "rueckeingabe_falsch",
                )
            if p["mode"] == "key":
                keystore.store_key(self.paths.key_file, p["secret"])
            self.cfg.mode = p["mode"]
            self.cfg.setup_done = True
            self.cfg.vault_path = p["path"]
            self.cfg.save(self.paths.root)
            self.vault = p["vault"]
            self._pending = None
            await self._activate()
            self.vault.audit("setup.completed")
            return {"state": self.state}

    async def setup_open_existing(self, path: str, secret: str) -> dict:
        async with self._lock:
            if self.cfg.setup_done or self.state == "ready":
                raise _bad(
                    "Die Einrichtung ist bereits abgeschlossen.", "bereits_eingerichtet", 409
                )
            file = Path(path)
            if not file.is_file():
                raise _bad("Diese Archivdatei wurde nicht gefunden.", "datei_fehlt", 404)
            self._discard_pending()
            opened = await self._try_open(file, secret)
            if opened is None:
                raise _bad(
                    "Der Schlüssel oder das Passwort passt nicht zu dieser Datei.",
                    "falsches_geheimnis",
                    401,
                )
            vault, key = opened
            self.cfg.mode = "key" if isinstance(key, bytes) else "password"
            self.cfg.setup_done = True
            self.cfg.vault_path = str(file)
            self.cfg.save(self.paths.root)
            if isinstance(key, bytes):
                keystore.store_key(self.paths.key_file, key)
            self.vault = vault
            await self._activate()
            return {"state": self.state}

    async def _try_open(self, path: Path, secret: str):
        candidates: list = []
        with contextlib.suppress(ValueError):
            candidates.append(parse_recovery_key(secret))
        candidates.append(secret)
        for cand in candidates:
            try:
                return await asyncio.to_thread(Vault.open, path, cand), cand
            except WrongKeyError:
                continue
        return None

    async def unlock(self, secret: str) -> dict:
        async with self._lock:
            if self.state == "ready":
                return {"state": "ready"}
            if self.state != "locked":
                raise _bad("Es gibt noch kein Archiv zum Entsperren.", "keine_einrichtung", 409)
            path = self.paths.vault(self.cfg)
            if not path.exists():
                self.reason = "archiv_fehlt"
                raise _bad(
                    "Die Archivdatei wurde nicht gefunden. Bitte den Ordner prüfen oder eine Sicherung"
                    " einspielen. Es wird kein neues Archiv angelegt.",
                    "archiv_fehlt",
                    404,
                )
            opened = await self._try_open(path, secret)
            if opened is None:
                raise _bad("Schlüssel oder Passwort stimmt nicht.", "falsches_geheimnis", 401)
            vault, key = opened
            if isinstance(key, bytes) and self.cfg.mode == "key":
                keystore.store_key(self.paths.key_file, key)
            self.vault = vault
            await self._activate()
            return {"state": self.state}

    async def lock(self) -> None:
        async with self._lock:
            if self.state != "ready":
                return
            if self.cfg.mode != "password":
                raise _bad("Sperren geht nur mit Passwort-Schutz.", "nicht_moeglich", 409)
            await self.shutdown()
            self.state, self.reason = "locked", "passwort"
            self.hub.publish("locked")

    # --- Sicherheit ----------------------------------------------------------------

    @staticmethod
    def _matches(expected: bytes | str, given: str) -> bool:
        import hmac

        if isinstance(expected, bytes):
            try:
                return hmac.compare_digest(expected, parse_recovery_key(given))
            except ValueError:
                return False
        return hmac.compare_digest(expected.encode(), given.encode())

    def verify_secret(self, given: str) -> bool:
        assert self.vault is not None
        with contextlib.suppress(ValueError):
            if self.vault.key_matches(parse_recovery_key(given)):
                return True
        return self.vault.key_matches(given)

    def _require_secret(self, given: str | None) -> None:
        if not given or not self.verify_secret(given):
            raise _bad("Schlüssel oder Passwort stimmt nicht.", "falsches_geheimnis", 401)

    async def change_password(self, current: str, new: str) -> None:
        async with self._lock:
            self._require_secret(current)
            if len(new or "") < MIN_PASSWORD:
                raise _bad(f"Das Passwort braucht mindestens {MIN_PASSWORD} Zeichen.")
            await asyncio.to_thread(self.vault.rekey, new)
            keystore.delete_key(self.paths.key_file)
            self.cfg.mode = "password"
            self.cfg.save(self.paths.root)
            self.vault.audit("security.password_changed")

    async def prepare_new_key(self, current: str) -> dict:
        async with self._lock:
            self._require_secret(current)
            self._pending_key = generate_key()
            return {"recovery_key": format_recovery_key(self._pending_key)}

    async def apply_new_key(self, entered: str) -> None:
        async with self._lock:
            if self._pending_key is None:
                raise _bad("Es wurde kein neuer Schlüssel vorbereitet.", "keine_einrichtung", 409)
            if not self._matches(self._pending_key, entered):
                raise _bad(
                    "Das stimmt nicht mit dem angezeigten Schlüssel überein.", "rueckeingabe_falsch"
                )
            key = self._pending_key
            await asyncio.to_thread(self.vault.rekey, key)
            keystore.store_key(self.paths.key_file, key)
            self._pending_key = None
            self.cfg.mode = "key"
            self.cfg.save(self.paths.root)
            self.vault.audit("security.key_changed")

    # --- Status --------------------------------------------------------------------

    def public_status(self) -> dict:
        from . import __version__

        return {
            "state": self.state,
            "reason": self.reason,
            "mode": self._pending["mode"] if self._pending else self.cfg.mode,
            "version": __version__,
            "setup_pending": self._pending is not None,
            "pending_vault_path": self._pending["path"] if self._pending else None,
            "key_store": keystore.method(),
        }

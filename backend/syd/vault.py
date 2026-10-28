"""Verschluesselte Einzeldatei-Ablage (SQLCipher + FTS5), siehe PLAN.md D3/D4 und 3.1/3.2.

Alles (Metadaten, Volltext, Dokumentinhalte, Audit-Log) liegt in einer Datei.
Es gibt absichtlich keine Funktion zum Loeschen von Dokumenten (D8), nur Archivieren.
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import sqlcipher3

PAGE_SIZE = 8192  # muss bei jedem Oeffnen gesetzt werden, SQLCipher speichert ihn nicht
CHUNK = 256 * 1024

STATES = ("eingegangen", "verarbeitet", "erkannt", "geprueft")

MIGRATIONS: list[str] = [
    """
    CREATE TABLE document (
        id INTEGER PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime TEXT NOT NULL,
        pages INTEGER NOT NULL,
        imported_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'eingegangen'
            CHECK (state IN ('eingegangen','verarbeitet','erkannt','geprueft')),
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
        archive_reason TEXT
    );
    CREATE TABLE blob_store (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document(id),
        page INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL,
        data BLOB NOT NULL,
        UNIQUE (document_id, page)
    );
    CREATE TABLE thumbnail (
        document_id INTEGER NOT NULL REFERENCES document(id),
        page INTEGER NOT NULL,
        image BLOB NOT NULL,
        PRIMARY KEY (document_id, page)
    );
    CREATE VIRTUAL TABLE ocr_fts USING fts5(
        text, document_id UNINDEXED, page UNINDEXED, tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY,
        ts TEXT NOT NULL,
        day TEXT NOT NULL,
        event TEXT NOT NULL,
        document_id INTEGER,
        batch_id INTEGER,
        device_id INTEGER,
        field TEXT
    );
    CREATE INDEX audit_log_day ON audit_log(day);
    CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
        BEGIN SELECT RAISE(ABORT, 'audit_log ist append-only'); END;
    CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
        BEGIN SELECT RAISE(ABORT, 'audit_log ist append-only'); END;
    CREATE TRIGGER document_no_delete BEFORE DELETE ON document
        BEGIN SELECT RAISE(ABORT, 'Dokumente werden nur archiviert'); END;
    CREATE TRIGGER blob_no_delete BEFORE DELETE ON blob_store
        BEGIN SELECT RAISE(ABORT, 'Dokumente werden nur archiviert'); END;
    """,
]

Key = bytes | str  # bytes: zufaelliger 32-Byte-Schluessel, str: Passwort

_FIELD_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_EVENT_RE = re.compile(r"^[a-z][a-z0-9_.]{0,63}$")


class VaultError(Exception):
    pass


class VaultMissingError(VaultError):
    """Datei fehlt. Es wird bewusst kein neues leeres Archiv angelegt."""


class WrongKeyError(VaultError):
    """Schluessel/Passwort falsch oder Datei beschaedigt."""


def generate_key() -> bytes:
    return secrets.token_bytes(32)


def format_recovery_key(key: bytes) -> str:
    if len(key) != 32:
        raise ValueError("Schluessel muss 32 Byte lang sein")
    text = base64.b32encode(key).decode().rstrip("=")
    return "-".join(text[i : i + 4] for i in range(0, len(text), 4))


def parse_recovery_key(text: str) -> bytes:
    clean = re.sub(r"[\s-]", "", text).upper()
    clean += "=" * (-len(clean) % 8)
    try:
        key = base64.b32decode(clean)
    except ValueError as exc:
        raise ValueError("Wiederherstellungsschluessel ungueltig") from exc
    if len(key) != 32:
        raise ValueError("Wiederherstellungsschluessel ungueltig")
    return key


def _key_pragma_value(key: Key) -> str:
    if isinstance(key, bytes):
        return f"\"x'{key.hex()}'\""
    return "'" + key.replace("'", "''") + "'"


def _apply_key(conn: sqlcipher3.Connection, key: Key) -> None:
    conn.execute(f"PRAGMA key = {_key_pragma_value(key)}")
    conn.execute(f"PRAGMA cipher_page_size = {PAGE_SIZE}")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Vault:
    def __init__(self, conn: sqlcipher3.Connection, path: Path, key: Key):
        self._conn = conn
        self.path = path
        self._key = key

    @classmethod
    def open(cls, path: str | os.PathLike, key: Key, *, create: bool = False) -> Vault:
        p = Path(path)
        if not p.exists() and not create:
            raise VaultMissingError(f"Archivdatei nicht gefunden: {p}")
        conn = sqlcipher3.connect(str(p), isolation_level=None)
        try:
            _apply_key(conn, key)
            conn.execute("SELECT count(*) FROM sqlite_master").fetchone()
        except sqlcipher3.DatabaseError as exc:
            conn.close()
            raise WrongKeyError("Schluessel falsch oder Datei beschaedigt") from exc
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        vault = cls(conn, p, key)
        vault._migrate()
        return vault

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> Vault:
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def _migrate(self) -> None:
        version = self._conn.execute("PRAGMA user_version").fetchone()[0]
        for i in range(version, len(MIGRATIONS)):
            self._conn.execute("BEGIN")
            try:
                for stmt in _split_script(MIGRATIONS[i]):
                    self._conn.execute(stmt)
                self._conn.execute(f"PRAGMA user_version = {i + 1}")
                self._conn.execute("COMMIT")
            except Exception:
                self._conn.execute("ROLLBACK")
                raise

    @property
    def schema_version(self) -> int:
        return self._conn.execute("PRAGMA user_version").fetchone()[0]

    # --- Schluessel ---------------------------------------------------------

    def rekey(self, new_key: Key) -> None:
        """Ersetzt den aktiven Schluessel. Danach gilt der alte nicht mehr (3.2)."""
        self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        self._conn.execute(f"PRAGMA rekey = {_key_pragma_value(new_key)}")
        self._key = new_key

    # --- Dokumente ----------------------------------------------------------

    def add_document(self, original_name: str, mime: str, pages: list[bytes]) -> tuple[int, bool]:
        """Legt ein Dokument an. Rueckgabe: (id, war_schon_vorhanden)."""
        if not pages:
            raise ValueError("Mindestens eine Seite erforderlich")
        page_hashes = [_sha(p) for p in pages]
        doc_hash = _sha("".join(page_hashes).encode())
        row = self._conn.execute("SELECT id FROM document WHERE sha256 = ?", (doc_hash,)).fetchone()
        if row:
            return row[0], True
        self._conn.execute("BEGIN")
        try:
            cur = self._conn.execute(
                "INSERT INTO document (sha256, original_name, mime, pages, imported_at)"
                " VALUES (?,?,?,?,?)",
                (doc_hash, original_name, mime, len(pages), _now()),
            )
            doc_id = cur.lastrowid
            for n, (data, h) in enumerate(zip(pages, page_hashes, strict=True), start=1):
                self._conn.execute(
                    "INSERT INTO blob_store (document_id, page, sha256, size, data)"
                    " VALUES (?,?,?,?,?)",
                    (doc_id, n, h, len(data), data),
                )
            self._audit("document.imported", document_id=doc_id)
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise
        return doc_id, False

    def stream_page(self, document_id: int, page: int, chunk: int = CHUNK) -> Iterator[bytes]:
        """Liest eine Seite stueckweise (inkrementeller BLOB-I/O), ohne alles zu laden."""
        row = self._conn.execute(
            "SELECT id, size FROM blob_store WHERE document_id = ? AND page = ?",
            (document_id, page),
        ).fetchone()
        if not row:
            raise KeyError((document_id, page))
        blob_id, size = row
        with self._conn.open_blob("blob_store", "data", blob_id, readonly=True) as blob:
            offset = 0
            while offset < size:
                part = blob.read(min(chunk, size - offset))
                if not part:
                    break
                offset += len(part)
                yield part

    def read_page(self, document_id: int, page: int) -> bytes:
        return b"".join(self.stream_page(document_id, page))

    def get_document(self, document_id: int) -> dict:
        cur = self._conn.execute(
            "SELECT id, sha256, original_name, mime, pages, imported_at, state, archived,"
            " archive_reason FROM document WHERE id = ?",
            (document_id,),
        )
        row = cur.fetchone()
        if not row:
            raise KeyError(document_id)
        return dict(zip([c[0] for c in cur.description], row, strict=True))

    def set_state(self, document_id: int, state: str) -> None:
        if state not in STATES:
            raise ValueError(f"Unbekannter Zustand: {state}")
        self._conn.execute("UPDATE document SET state = ? WHERE id = ?", (state, document_id))
        self._audit("document.state_changed", document_id=document_id, field="state")

    def archive(self, document_id: int, reason: str) -> None:
        if not reason.strip():
            raise ValueError("Archivieren braucht einen Grund")
        self._set_archived(document_id, 1, reason, "document.archived")

    def restore(self, document_id: int) -> None:
        self._set_archived(document_id, 0, None, "document.restored")

    def _set_archived(self, document_id: int, flag: int, reason: str | None, event: str) -> None:
        cur = self._conn.execute(
            "UPDATE document SET archived = ?, archive_reason = ? WHERE id = ?",
            (flag, reason, document_id),
        )
        if cur.rowcount == 0:
            raise KeyError(document_id)
        self._audit(event, document_id=document_id)

    # --- Volltext -----------------------------------------------------------

    def index_text(self, document_id: int, page: int, text: str) -> None:
        self._conn.execute(
            "DELETE FROM ocr_fts WHERE document_id = ? AND page = ?", (document_id, page)
        )
        self._conn.execute(
            "INSERT INTO ocr_fts (text, document_id, page) VALUES (?,?,?)",
            (text, document_id, page),
        )

    def search(self, query: str, *, include_archived: bool = False) -> list[int]:
        """Volltextsuche. Der Suchtext wird als Folge von Woertern behandelt (kein FTS-Syntax)."""
        terms = re.findall(r"\w+", query)
        if not terms:
            return []
        match = " ".join('"' + t + '"*' for t in terms)
        sql = (
            "SELECT DISTINCT f.document_id FROM ocr_fts f JOIN document d ON d.id = f.document_id"
            " WHERE ocr_fts MATCH ?"
        )
        if not include_archived:
            sql += " AND d.archived = 0"
        return [r[0] for r in self._conn.execute(sql + " ORDER BY f.document_id", (match,))]

    # --- Audit-Log (nur IDs, 4.7) --------------------------------------------

    def _audit(
        self,
        event: str,
        *,
        document_id: int | None = None,
        batch_id: int | None = None,
        device_id: int | None = None,
        field: str | None = None,
    ) -> None:
        if not _EVENT_RE.match(event):
            raise ValueError("Ungueltiger Ereignistyp")
        if field is not None and not _FIELD_RE.match(field):
            raise ValueError("Ungueltiger Feldname")
        for value in (document_id, batch_id, device_id):
            if value is not None and not isinstance(value, int):
                raise TypeError("Audit-Log nimmt nur IDs auf")
        now = _now()
        self._conn.execute(
            "INSERT INTO audit_log (ts, day, event, document_id, batch_id, device_id, field)"
            " VALUES (?,?,?,?,?,?,?)",
            (now, now[:10], event, document_id, batch_id, device_id, field),
        )

    def audit(self, event: str, **ids) -> None:
        self._audit(event, **ids)

    def audit_day(self, day: str) -> list[dict]:
        cur = self._conn.execute(
            "SELECT ts, event, document_id, batch_id, device_id, field FROM audit_log"
            " WHERE day = ? ORDER BY id",
            (day,),
        )
        names = [c[0] for c in cur.description]
        return [dict(zip(names, r, strict=True)) for r in cur]

    # --- Sicherung und Pruefung ----------------------------------------------

    def integrity_check(self) -> bool:
        rows = self._conn.execute("PRAGMA cipher_integrity_check").fetchall()
        quick = self._conn.execute("PRAGMA integrity_check").fetchone()[0]
        return not rows and quick == "ok"

    def backup_to(self, dest: str | os.PathLike) -> None:
        """Konsistente Sicherung ueber die SQLite-Backup-Funktion (nicht per Dateikopie)."""
        d = Path(dest)
        if d.exists():
            raise VaultError("Zieldatei existiert bereits")
        self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        target = sqlcipher3.connect(str(d), isolation_level=None)
        try:
            _apply_key(target, self._key)
            self._conn.backup(target)
        finally:
            target.close()


def _split_script(script: str) -> list[str]:
    """Trennt Skript an Semikolons, ausser innerhalb von BEGIN ... END (Trigger)."""
    stmts, buf, depth = [], [], 0
    for line in script.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        buf.append(line)
        upper = stripped.upper()
        if upper.startswith("CREATE TRIGGER"):
            depth = 1
        if depth and upper.rstrip(";").endswith("END"):
            depth = 0
        if not depth and stripped.endswith(";"):
            stmts.append("\n".join(buf).rstrip().rstrip(";"))
            buf = []
    if buf:
        stmts.append("\n".join(buf).rstrip().rstrip(";"))
    return stmts


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

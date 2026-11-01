"""Verschluesselte Einzeldatei-Ablage (SQLCipher + FTS5), siehe PLAN.md D3/D4 und 3.1/3.2.

Alles (Metadaten, Volltext, Dokumentinhalte, Audit-Log) liegt in einer Datei.
Es gibt absichtlich keine Funktion zum Loeschen von Dokumenten (D8), nur Archivieren.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import threading
from collections.abc import Iterator
from contextlib import contextmanager
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
    """
    CREATE TABLE company (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        name_norm TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
    );
    CREATE TABLE company_alias (
        id INTEGER PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES company(id),
        alias TEXT NOT NULL,
        alias_norm TEXT NOT NULL UNIQUE
    );
    CREATE TABLE category (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES category(id)
    );
    CREATE UNIQUE INDEX category_unique ON category(IFNULL(parent_id, 0), name);
    CREATE TABLE tag (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color TEXT NOT NULL DEFAULT '#3b82f6'
    );
    CREATE TABLE document_tag (
        document_id INTEGER NOT NULL REFERENCES document(id),
        tag_id INTEGER NOT NULL REFERENCES tag(id),
        PRIMARY KEY (document_id, tag_id)
    );
    CREATE TABLE import_batch (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('upload','localsend')),
        device_alias TEXT,
        device_fingerprint TEXT,
        received_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'wartet' CHECK (status IN ('wartet','uebernommen'))
    );
    CREATE TABLE import_file (
        id INTEGER PRIMARY KEY,
        batch_id INTEGER NOT NULL REFERENCES import_batch(id),
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        mime TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'wartet' CHECK (state IN ('wartet','uebernommen')),
        document_id INTEGER REFERENCES document(id)
    );
    CREATE TABLE trusted_device (
        id INTEGER PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        alias TEXT NOT NULL,
        trusted_since TEXT NOT NULL
    );
    CREATE TABLE document_link (
        id INTEGER PRIMARY KEY,
        from_id INTEGER NOT NULL REFERENCES document(id),
        to_id INTEGER NOT NULL REFERENCES document(id),
        type TEXT NOT NULL CHECK (type IN ('antwort_auf','gehoert_zu','ersetzt')),
        status TEXT NOT NULL DEFAULT 'vorgeschlagen'
            CHECK (status IN ('vorgeschlagen','bestaetigt','abgelehnt')),
        reason TEXT,
        score INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        CHECK (from_id <> to_id)
    );
    CREATE UNIQUE INDEX document_link_pair ON document_link(MIN(from_id, to_id), MAX(from_id, to_id));
    CREATE TABLE deadline (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document(id),
        type TEXT NOT NULL CHECK (type IN ('zahlungsziel','vertragsende','kuendigungsfrist','sonstige')),
        due_date TEXT NOT NULL,
        source TEXT NOT NULL,
        confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1)),
        repeat_months INTEGER NOT NULL DEFAULT 0,
        lead_days TEXT,
        status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt','abgelaufen')),
        note TEXT,
        parent_id INTEGER REFERENCES deadline(id),
        confidence REAL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX deadline_due ON deadline(due_date);
    CREATE TABLE reminder (
        id INTEGER PRIMARY KEY,
        deadline_id INTEGER NOT NULL REFERENCES deadline(id),
        lead_days INTEGER NOT NULL,
        due_on TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'offen'
            CHECK (state IN ('offen','angezeigt','erledigt','zurueckgestellt')),
        shown_at TEXT,
        snoozed_until TEXT,
        UNIQUE (deadline_id, lead_days)
    );
    CREATE INDEX reminder_due ON reminder(due_on, state);
    CREATE TABLE reminder_default (
        deadline_type TEXT PRIMARY KEY,
        lead_days TEXT NOT NULL
    );
    CREATE TABLE extraction (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document(id),
        run_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value TEXT,
        confidence REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('regex','llm','manuell','archiv'))
    );
    CREATE INDEX extraction_doc ON extraction(document_id);
    CREATE TABLE reference_number (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document(id),
        type TEXT NOT NULL CHECK (type IN
            ('aktenzeichen','kundennummer','vertragsnummer','schadennummer',
             'rechnungsnummer','geschaeftszeichen')),
        value TEXT NOT NULL,
        value_norm TEXT NOT NULL,
        source TEXT NOT NULL,
        confirmed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX reference_norm ON reference_number(value_norm);
    CREATE TABLE field_history (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document(id),
        field TEXT NOT NULL,
        old TEXT,
        new TEXT,
        changed_at TEXT NOT NULL,
        by TEXT NOT NULL DEFAULT 'nutzer'
    );
    CREATE TABLE ocr_text (
        document_id INTEGER NOT NULL REFERENCES document(id),
        page INTEGER NOT NULL,
        text TEXT NOT NULL,
        confidence REAL,
        PRIMARY KEY (document_id, page)
    );
    CREATE TABLE export_template (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        path_template TEXT NOT NULL,
        file_template TEXT NOT NULL,
        include_archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE job (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES document(id),
        kind TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'wartend'
            CHECK (state IN ('wartend','laeuft','fertig','fehler')),
        error_code TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX job_state ON job(state);
    ALTER TABLE document ADD COLUMN doc_type TEXT;
    ALTER TABLE document ADD COLUMN company_id INTEGER REFERENCES company(id);
    ALTER TABLE document ADD COLUMN category_id INTEGER REFERENCES category(id);
    ALTER TABLE document ADD COLUMN doc_date TEXT;
    ALTER TABLE document ADD COLUMN amount_cents INTEGER;
    ALTER TABLE document ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
    ALTER TABLE document ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE document ADD COLUMN paid_at TEXT;
    ALTER TABLE document ADD COLUMN note TEXT;
    ALTER TABLE document ADD COLUMN reviewed_at TEXT;
    ALTER TABLE document ADD COLUMN batch_id INTEGER REFERENCES import_batch(id);
    ALTER TABLE document ADD COLUMN ocr_confidence REAL;
    ALTER TABLE blob_store ADD COLUMN mime TEXT NOT NULL DEFAULT 'application/octet-stream';
    ALTER TABLE blob_store ADD COLUMN name TEXT;
    CREATE INDEX document_company ON document(company_id);
    CREATE INDEX document_date ON document(doc_date);
    CREATE INDEX document_state ON document(state, archived);
    CREATE TRIGGER field_history_no_update BEFORE UPDATE ON field_history
        BEGIN SELECT RAISE(ABORT, 'field_history ist append-only'); END;
    CREATE TRIGGER field_history_no_delete BEFORE DELETE ON field_history
        BEGIN SELECT RAISE(ABORT, 'field_history ist append-only'); END;
    """,
    """
    ALTER TABLE reminder ADD COLUMN notified INTEGER NOT NULL DEFAULT 0;
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
        self.lock = threading.RLock()
        self._depth = 0

    @classmethod
    def open(cls, path: str | os.PathLike, key: Key, *, create: bool = False) -> Vault:
        p = Path(path)
        if not p.exists() and not create:
            raise VaultMissingError(f"Archivdatei nicht gefunden: {p}")
        conn = sqlcipher3.connect(str(p), isolation_level=None, check_same_thread=False)
        try:
            _apply_key(conn, key)
            conn.execute("SELECT count(*) FROM sqlite_master").fetchone()
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if not create and version == 0:
                raise WrongKeyError("Datei ist kein initialisiertes Archiv")
        except WrongKeyError:
            conn.close()
            raise
        except sqlcipher3.DatabaseError as exc:
            conn.close()
            raise WrongKeyError("Schluessel falsch oder Datei beschaedigt") from exc
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        vault = cls(conn, p, key)
        vault._migrate()
        return vault

    def close(self) -> None:
        with self.lock:
            self._conn.close()

    # --- Zugriff fuer die Dienste (thread-sicher, verschachtelbare Transaktionen) ----

    @contextmanager
    def tx(self):
        with self.lock:
            outer = self._depth == 0
            name = f"sp{self._depth}"
            self._conn.execute("BEGIN" if outer else f"SAVEPOINT {name}")
            self._depth += 1
            try:
                yield self
            except BaseException:
                self._depth -= 1
                self._conn.execute("ROLLBACK" if outer else f"ROLLBACK TO {name}")
                if not outer:
                    self._conn.execute(f"RELEASE {name}")
                raise
            else:
                self._depth -= 1
                self._conn.execute("COMMIT" if outer else f"RELEASE {name}")

    def execute(self, sql: str, params: tuple | list = ()) -> sqlcipher3.Cursor:
        with self.lock:
            return self._conn.execute(sql, params)

    def rows(self, sql: str, params: tuple | list = ()) -> list[dict]:
        with self.lock:
            cur = self._conn.execute(sql, params)
            names = [c[0] for c in cur.description or []]
            return [dict(zip(names, r, strict=True)) for r in cur.fetchall()]

    def row(self, sql: str, params: tuple | list = ()) -> dict | None:
        found = self.rows(sql, params)
        return found[0] if found else None

    def scalar(self, sql: str, params: tuple | list = ()):
        with self.lock:
            r = self._conn.execute(sql, params).fetchone()
            return r[0] if r else None

    def __enter__(self) -> Vault:
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def _migrate(self) -> None:
        version = self._conn.execute("PRAGMA user_version").fetchone()[0]
        for i in range(version, len(MIGRATIONS)):
            with self.tx():
                for stmt in _split_script(MIGRATIONS[i]):
                    self._conn.execute(stmt)
                self._conn.execute(f"PRAGMA user_version = {i + 1}")

    @property
    def schema_version(self) -> int:
        return self._conn.execute("PRAGMA user_version").fetchone()[0]

    # --- Schluessel ---------------------------------------------------------

    def rekey(self, new_key: Key) -> None:
        """Ersetzt den aktiven Schluessel. Danach gilt der alte nicht mehr (3.2)."""
        with self.lock:
            self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            self._conn.execute(f"PRAGMA rekey = {_key_pragma_value(new_key)}")
            self._key = new_key

    def key_matches(self, candidate: Key) -> bool:
        """Prueft eine erneute Eingabe gegen den aktiven Schluessel (zeitkonstant)."""
        a = self._key if isinstance(self._key, bytes) else self._key.encode()
        b = candidate if isinstance(candidate, bytes) else candidate.encode()
        return hmac.compare_digest(a, b)

    # --- Dokumente ----------------------------------------------------------

    def add_document(
        self,
        original_name: str,
        mime: str,
        pages: list[bytes],
        *,
        mimes: list[str] | None = None,
        names: list[str] | None = None,
        batch_id: int | None = None,
        archive_reason: str | None = None,
    ) -> tuple[int, bool]:
        """Legt ein Dokument an (jede Datei ein Teil). Rueckgabe: (id, war_schon_vorhanden)."""
        if not pages:
            raise ValueError("Mindestens eine Seite erforderlich")
        mimes = mimes or [mime] * len(pages)
        names = names or [original_name] * len(pages)
        page_hashes = [_sha(p) for p in pages]
        doc_hash = _sha("".join(page_hashes).encode())
        with self.tx():
            row = self._conn.execute(
                "SELECT id FROM document WHERE sha256 = ?", (doc_hash,)
            ).fetchone()
            if row:
                return row[0], True
            cur = self._conn.execute(
                "INSERT INTO document (sha256, original_name, mime, pages, imported_at, batch_id,"
                " archived, archive_reason) VALUES (?,?,?,?,?,?,?,?)",
                (
                    doc_hash,
                    original_name,
                    mime,
                    len(pages),
                    _now(),
                    batch_id,
                    1 if archive_reason else 0,
                    archive_reason,
                ),
            )
            doc_id = cur.lastrowid
            for n, (data, h, m, nm) in enumerate(
                zip(pages, page_hashes, mimes, names, strict=True), start=1
            ):
                self._conn.execute(
                    "INSERT INTO blob_store (document_id, page, sha256, size, data, mime, name)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (doc_id, n, h, len(data), data, m, nm),
                )
            self._audit("document.imported", document_id=doc_id, batch_id=batch_id)
        return doc_id, False

    def stream_page(self, document_id: int, page: int, chunk: int = CHUNK) -> Iterator[bytes]:
        """Liest eine Seite stueckweise (inkrementeller BLOB-I/O), ohne alles zu laden."""
        row = self.row(
            "SELECT id, size FROM blob_store WHERE document_id = ? AND page = ?",
            (document_id, page),
        )
        if not row:
            raise KeyError((document_id, page))
        blob_id, size, offset = row["id"], row["size"], 0
        while offset < size:
            with (
                self.lock,
                self._conn.open_blob("blob_store", "data", blob_id, readonly=True) as blob,
            ):
                blob.seek(offset)
                part = blob.read(min(chunk, size - offset))
            if not part:
                break
            offset += len(part)
            yield part

    def read_page(self, document_id: int, page: int) -> bytes:
        return b"".join(self.stream_page(document_id, page))

    def get_document(self, document_id: int) -> dict:
        row = self.row(
            "SELECT id, sha256, original_name, mime, pages, imported_at, state, archived,"
            " archive_reason FROM document WHERE id = ?",
            (document_id,),
        )
        if not row:
            raise KeyError(document_id)
        return row

    def set_state(self, document_id: int, state: str) -> None:
        if state not in STATES:
            raise ValueError(f"Unbekannter Zustand: {state}")
        with self.tx():
            self._conn.execute("UPDATE document SET state = ? WHERE id = ?", (state, document_id))
            self._audit("document.state_changed", document_id=document_id, field="state")

    def archive(self, document_id: int, reason: str) -> None:
        if not reason.strip():
            raise ValueError("Archivieren braucht einen Grund")
        self._set_archived(document_id, 1, reason, "document.archived")

    def restore(self, document_id: int) -> None:
        self._set_archived(document_id, 0, None, "document.restored")

    def _set_archived(self, document_id: int, flag: int, reason: str | None, event: str) -> None:
        with self.tx():
            cur = self._conn.execute(
                "UPDATE document SET archived = ?, archive_reason = ? WHERE id = ?",
                (flag, reason, document_id),
            )
            if cur.rowcount == 0:
                raise KeyError(document_id)
            self._audit(event, document_id=document_id)

    # --- Volltext -----------------------------------------------------------

    def index_text(self, document_id: int, page: int, text: str) -> None:
        with self.tx():
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
        with self.lock:
            return [
                r[0]
                for r in self._conn.execute(sql + " ORDER BY f.document_id", (match,)).fetchall()
            ]

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
        self.execute(
            "INSERT INTO audit_log (ts, day, event, document_id, batch_id, device_id, field)"
            " VALUES (?,?,?,?,?,?,?)",
            (now, now[:10], event, document_id, batch_id, device_id, field),
        )

    def audit(self, event: str, **ids) -> None:
        self._audit(event, **ids)

    def audit_days(self) -> list[str]:
        return [r["day"] for r in self.rows("SELECT DISTINCT day FROM audit_log ORDER BY day DESC")]

    def audit_day(self, day: str) -> list[dict]:
        return self.rows(
            "SELECT ts, event, document_id, batch_id, device_id, field FROM audit_log"
            " WHERE day = ? ORDER BY id",
            (day,),
        )

    # --- Sicherung und Pruefung ----------------------------------------------

    def integrity_check(self) -> bool:
        with self.lock:
            rows = self._conn.execute("PRAGMA cipher_integrity_check").fetchall()
            quick = self._conn.execute("PRAGMA integrity_check").fetchone()[0]
        return not rows and quick == "ok"

    def backup_to(self, dest: str | os.PathLike) -> None:
        """Konsistente Sicherung ueber die SQLite-Backup-Funktion (nicht per Dateikopie)."""
        d = Path(dest)
        if d.exists():
            raise VaultError("Zieldatei existiert bereits")
        with self.lock:
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

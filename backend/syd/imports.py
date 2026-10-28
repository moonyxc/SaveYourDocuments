"""Import: Quarantaene/Stapel, Gruppieren (Nutzer), Uebernahme ins Archiv (PLAN 4.1)."""

from __future__ import annotations

import hashlib
import secrets
import shutil
from collections.abc import Callable
from pathlib import Path

from .localsend import ALLOWED_MIME, Batch, sanitize_filename, sniff_mime
from .repo import ArchiveError, NotFoundError, Repo
from .util import now_iso

DISCARD_REASON = "Beim Import aussortiert"


class ImportService:
    def __init__(
        self,
        repo: Repo,
        staging_dir: Path,
        on_new_document: Callable[[int], None] | None = None,
    ):
        self.repo = repo
        self.v = repo.v
        self.staging = Path(staging_dir)
        self.staging.mkdir(parents=True, exist_ok=True)
        self.on_new_document = on_new_document

    # --- Aufnahme in die Quarantaene --------------------------------------------------

    def max_bytes(self) -> int:
        return int(self.repo.get_setting("max_file_mb")) * 1024 * 1024

    def stage_uploads(self, files: list[tuple[str, bytes]]) -> dict:
        """UI-Upload (Datei auswaehlen oder Drag and Drop): pruefen, ablegen, Stapel anlegen."""
        if not files:
            raise ArchiveError("Es wurde keine Datei übergeben.", "ungueltig")
        sdir = self.staging / ("u-" + secrets.token_urlsafe(8))
        sdir.mkdir(parents=True)
        accepted, rejected = [], []
        limit = self.max_bytes()
        for n, (name, data) in enumerate(files, start=1):
            clean = sanitize_filename(name)
            mime = sniff_mime(data[:16])
            if mime is None or mime not in ALLOWED_MIME:
                rejected.append(
                    {
                        "name": clean,
                        "reason": "Nur Fotos (JPG, PNG, HEIC, WebP, TIFF) und PDF sind erlaubt.",
                    }
                )
                continue
            if len(data) > limit:
                rejected.append(
                    {
                        "name": clean,
                        "reason": f"Die Datei ist größer als {limit // 1024 // 1024} MB.",
                    }
                )
                continue
            if not data:
                rejected.append({"name": clean, "reason": "Die Datei ist leer."})
                continue
            path = sdir / f"{n:03d}-{clean}"
            path.write_bytes(data)
            accepted.append((clean, path, len(data), hashlib.sha256(data).hexdigest(), mime))
        if not accepted:
            shutil.rmtree(sdir, ignore_errors=True)
            return {"batch_id": None, "files": 0, "rejected": rejected}
        batch_id = self._register("upload", None, None, accepted)
        return {"batch_id": batch_id, "files": len(accepted), "rejected": rejected}

    def register_localsend(self, batch: Batch) -> int:
        """Vom Empfaenger aufgerufen, wenn eine Sitzung komplett ist. Dateien bleiben in ihrer Quarantaene."""
        files = [(f.original_name, f.path, f.size, f.sha256, f.mime) for f in batch.files]
        known = self.v.row(
            "SELECT id FROM trusted_device WHERE fingerprint = ?", (batch.device.fingerprint,)
        )
        batch_id = self._register(
            "localsend", batch.device.alias, batch.device.fingerprint, files,
            device_id=known["id"] if known else None,
        )  # fmt: skip
        return batch_id

    def _register(self, source, alias, fingerprint, files, device_id: int | None = None) -> int:
        with self.v.tx():
            batch_id = self.v.execute(
                "INSERT INTO import_batch (source, device_alias, device_fingerprint, received_at, status)"
                " VALUES (?,?,?,?,'wartet')",
                (source, alias, fingerprint, now_iso()),
            ).lastrowid
            for name, path, size, sha, mime in files:
                self.v.execute(
                    "INSERT INTO import_file (batch_id, name, path, size, sha256, mime, state)"
                    " VALUES (?,?,?,?,?,?,'wartet')",
                    (batch_id, name, str(path), size, sha, mime),
                )
            self.v._audit("batch.received", batch_id=batch_id, device_id=device_id)
        return batch_id

    # --- Lesen ------------------------------------------------------------------------

    def pending(self) -> list[dict]:
        batches = self.v.rows(
            "SELECT id, source, device_alias, received_at FROM import_batch WHERE status = 'wartet'"
            " ORDER BY id"
        )
        for b in batches:
            b["files"] = self.v.rows(
                "SELECT id, name, size, mime, sha256, state FROM import_file WHERE batch_id = ?"
                " AND state = 'wartet' ORDER BY id",
                (b["id"],),
            )
        return [b for b in batches if b["files"]]

    def file(self, file_id: int) -> dict:
        row = self.v.row("SELECT * FROM import_file WHERE id = ?", (file_id,))
        if not row:
            raise NotFoundError("Die Datei")
        return row

    def file_bytes(self, file_id: int) -> tuple[bytes, str]:
        row = self.file(file_id)
        path = Path(row["path"])
        if not path.exists():
            raise ArchiveError(
                "Die Datei im Eingang wurde nicht mehr gefunden.", "datei_fehlt", 410
            )
        return path.read_bytes(), row["mime"]

    # --- Uebernahme -------------------------------------------------------------------

    def commit(
        self, batch_id: int, groups: list[list[int]], discard: list[int] | None = None
    ) -> dict:
        """Gruppen = zusammengehoerende Dateien (Reihenfolge = Seitenreihenfolge).

        Nicht zugeordnete Dateien muessen in `discard` stehen; sie werden archiviert, nicht geloescht.
        """
        batch = self.v.row("SELECT * FROM import_batch WHERE id = ?", (batch_id,))
        if not batch:
            raise NotFoundError("Der Stapel")
        discard = discard or []
        open_files = {
            r["id"]: r
            for r in self.v.rows(
                "SELECT * FROM import_file WHERE batch_id = ? AND state = 'wartet'", (batch_id,)
            )
        }
        used = [fid for g in groups for fid in g] + list(discard)
        if len(used) != len(set(used)):
            raise ArchiveError("Eine Datei ist mehreren Dokumenten zugeordnet.", "ungueltig")
        if any(not g for g in groups):
            raise ArchiveError("Ein Dokument braucht mindestens eine Datei.", "ungueltig")
        if set(used) - set(open_files):
            raise ArchiveError("Eine Datei gehört nicht zu diesem Stapel.", "ungueltig")
        if set(open_files) - set(used):
            raise ArchiveError(
                "Bitte jede Datei einem Dokument zuordnen oder aussortieren.", "unvollstaendig"
            )
        created: list[int] = []
        duplicates: list[int] = []
        archived: list[int] = []
        entries = [(g, None) for g in groups] + [([fid], DISCARD_REASON) for fid in discard]
        for fids, _reason in entries:
            rows = [open_files[f] for f in fids]
            if any(not Path(r["path"]).exists() for r in rows):
                raise ArchiveError("Eine Datei im Eingang fehlt.", "datei_fehlt", 410)
        for fids, reason in entries:
            rows = [open_files[f] for f in fids]
            pages = [Path(r["path"]).read_bytes() for r in rows]
            with self.v.tx():
                doc_id, existed = self.v.add_document(
                    rows[0]["name"], rows[0]["mime"], pages,
                    mimes=[r["mime"] for r in rows], names=[r["name"] for r in rows],
                    batch_id=batch_id, archive_reason=reason,
                )  # fmt: skip
                for r in rows:
                    self.v.execute(
                        "UPDATE import_file SET state = 'uebernommen', document_id = ? WHERE id = ?",
                        (doc_id, r["id"]),
                    )
                if existed:
                    duplicates.append(doc_id)
                elif reason:
                    archived.append(doc_id)
                else:
                    created.append(doc_id)
                    self.v.execute(
                        "INSERT INTO job (document_id, kind, state, created_at, updated_at)"
                        " VALUES (?,'process','wartend',?,?)",
                        (doc_id, now_iso(), now_iso()),
                    )
        with self.v.tx():
            self.v.execute(
                "UPDATE import_batch SET status = 'uebernommen' WHERE id = ?", (batch_id,)
            )
            self.v._audit("batch.committed", batch_id=batch_id)
        for r in open_files.values():
            Path(r["path"]).unlink(missing_ok=True)
            try:
                Path(r["path"]).parent.rmdir()
            except OSError:
                pass
        if self.on_new_document:
            for doc_id in created:
                self.on_new_document(doc_id)
        return {"created": created, "duplicates": duplicates, "archived": archived}

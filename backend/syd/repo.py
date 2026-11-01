"""Dienstschicht ueber dem Vault: Einstellungen, Firmen, Bereiche, Tags, Dokumente.

Fachregeln (PLAN.md): nur `geprueft` zaehlt fuer Auswertungen und Erinnerungen, Korrekturen
landen als Alt/Neu in `field_history`, Dokumente werden nie geloescht.
"""

from __future__ import annotations

import difflib
import json
import re
from collections.abc import Callable
from datetime import date

from .util import (
    format_eur,
    norm_ref,
    norm_text,
    now_iso,
    valid_iso_date,
)
from .vault import Vault

DOC_TYPES = [
    "Rechnung",
    "Beitragsrechnung",
    "Mahnung",
    "Zahlungsbeleg",
    "Kaufbeleg",
    "Vertrag",
    "Versicherungsschein",
    "Kündigung",
    "Kündigungsbestätigung",
    "Bescheid",
    "Schadenmeldung",
    "Schreiben",
    "Jahresabrechnung",
    "Sonstiges",
]

DEFAULT_CATEGORIES = [
    "Versicherung",
    "Telefon & Internet",
    "Strom & Gas",
    "Steuern & Behörden",
    "Bank & Finanzen",
    "Elektronik",
    "Haushalt & Möbel",
    "Handwerker",
    "Gesundheit",
    "Wohnen & Miete",
    "Auto & Verkehr",
    "Arbeit & Gehalt",
    "Sonstiges",
]

REF_TYPES = (
    "aktenzeichen",
    "kundennummer",
    "vertragsnummer",
    "schadennummer",
    "rechnungsnummer",
    "geschaeftszeichen",
)
DEADLINE_TYPES = ("zahlungsziel", "vertragsende", "kuendigungsfrist", "sonstige")
DEFAULT_LEADS = {
    "zahlungsziel": [7, 1],
    "vertragsende": [30, 7],
    "kuendigungsfrist": [30, 7],
    "sonstige": [7, 1],
}

DEFAULT_SETTINGS: dict[str, object] = {
    "display_name_enabled": True,
    "display_name_template": "{firma}_{art}_{datum}_{betrag}",
    "batch_confirm_enabled": True,
    "batch_confirm_threshold": 0.9,
    "localsend_enabled": True,
    "localsend_alias": "Save Your Documents",
    "localsend_auto_accept": False,
    "localsend_pin": None,
    "max_file_mb": 100,
    "space_saving": False,
    "ollama_enabled": False,
    "ollama_url": "http://127.0.0.1:11434",
    "ollama_model": "qwen2.5:7b",
    "font_size": 16,
    "update_check_auto": False,
    "developer_mode": False,
}

EDITABLE_FIELDS = {
    "doc_type",
    "company_id",
    "category_id",
    "doc_date",
    "amount_cents",
    "note",
}

DOC_COLUMNS = (
    "d.id, d.sha256, d.original_name, d.mime, d.pages, d.imported_at, d.state, d.archived,"
    " d.archive_reason, d.doc_type, d.company_id, d.category_id, d.doc_date, d.amount_cents,"
    " d.currency, d.paid, d.paid_at, d.note, d.reviewed_at, d.batch_id, d.ocr_confidence,"
    " c.name AS company_name, cat.name AS category_name"
)
DOC_FROM = (
    " FROM document d LEFT JOIN company c ON c.id = d.company_id"
    " LEFT JOIN category cat ON cat.id = d.category_id"
)

MIME_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/tiff": ".tif",
    "application/pdf": ".pdf",
}


class ArchiveError(Exception):
    """Fachlicher Fehler mit verstaendlicher deutscher Meldung und Code."""

    def __init__(self, message: str, code: str = "fehler", status: int = 400, **extra):
        super().__init__(message)
        self.message, self.code, self.status, self.extra = message, code, status, extra


class NotFoundError(ArchiveError):
    def __init__(self, what: str):
        super().__init__(f"{what} wurde nicht gefunden.", "nicht_gefunden", 404)


class Repo:
    def __init__(self, vault: Vault, today: Callable[[], date] = date.today):
        self.v = vault
        self.today = today
        self.ensure_defaults()

    # ------------------------------------------------------------------ Einstellungen

    def ensure_defaults(self) -> None:
        with self.v.tx():
            for name in DEFAULT_CATEGORIES:
                self.v.execute(
                    "INSERT OR IGNORE INTO category (name, parent_id) VALUES (?, NULL)", (name,)
                )
            for typ, leads in DEFAULT_LEADS.items():
                self.v.execute(
                    "INSERT OR IGNORE INTO reminder_default (deadline_type, lead_days) VALUES (?,?)",
                    (typ, json.dumps(leads)),
                )
            if not self.v.scalar("SELECT count(*) FROM export_template"):
                self.v.execute(
                    "INSERT INTO export_template (name, path_template, file_template,"
                    " include_archived) VALUES (?,?,?,0)",
                    ("Standard", "{firma}/{jahr}", "{datum}_{art}_{betrag}"),
                )

    def get_settings(self) -> dict:
        out = dict(DEFAULT_SETTINGS)
        for r in self.v.rows("SELECT key, value FROM settings"):
            if r["key"] in DEFAULT_SETTINGS:
                out[r["key"]] = json.loads(r["value"])
        return out

    def get_setting(self, key: str):
        return self.get_settings()[key]

    def update_settings(self, changes: dict) -> dict:
        for key, value in changes.items():
            if key not in DEFAULT_SETTINGS:
                raise ArchiveError(f"Unbekannte Einstellung: {key}", "ungueltig")
            self._validate_setting(key, value)
        with self.v.tx():
            for key, value in changes.items():
                self.v.execute(
                    "INSERT INTO settings (key, value) VALUES (?,?)"
                    " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, json.dumps(value)),
                )
            self.v.audit("settings.changed")
        return self.get_settings()

    @staticmethod
    def _validate_setting(key: str, value) -> None:
        default = DEFAULT_SETTINGS[key]
        if key == "localsend_pin":
            if value is not None and not re.fullmatch(r"\d{4,8}", str(value)):
                raise ArchiveError("Die PIN besteht aus 4 bis 8 Ziffern.", "ungueltig")
        elif key == "ollama_url":
            from .extract.ollama import ensure_local_url

            ensure_local_url(str(value))
        elif key == "font_size":
            if value not in (14, 16, 18, 20):
                raise ArchiveError("Schriftgröße: 14, 16, 18 oder 20.", "ungueltig")
        elif key == "batch_confirm_threshold":
            if not isinstance(value, int | float) or not 0.5 <= value <= 1:
                raise ArchiveError("Schwelle zwischen 0,5 und 1.", "ungueltig")
        elif key == "max_file_mb":
            if not isinstance(value, int) or not 1 <= value <= 1000:
                raise ArchiveError("Größenlimit zwischen 1 und 1000 MB.", "ungueltig")
        elif key == "display_name_template":
            if not isinstance(value, str) or not value.strip() or len(value) > 200:
                raise ArchiveError("Die Namensvorlage darf nicht leer sein.", "ungueltig")
        elif isinstance(default, bool) and not isinstance(value, bool):
            raise ArchiveError("Ja/Nein erwartet.", "ungueltig")
        elif isinstance(default, str) and not isinstance(value, str):
            raise ArchiveError("Text erwartet.", "ungueltig")

    # ------------------------------------------------------------------ Firmen

    def list_companies(self) -> list[dict]:
        rows = self.v.rows(
            "SELECT c.id, c.name, (SELECT count(*) FROM document d WHERE d.company_id = c.id)"
            " AS documents FROM company c ORDER BY c.name COLLATE NOCASE"
        )
        aliases: dict[int, list[str]] = {}
        for a in self.v.rows("SELECT company_id, alias FROM company_alias ORDER BY alias"):
            aliases.setdefault(a["company_id"], []).append(a["alias"])
        for r in rows:
            r["aliases"] = aliases.get(r["id"], [])
        return rows

    def get_company(self, company_id: int) -> dict:
        row = self.v.row("SELECT id, name FROM company WHERE id = ?", (company_id,))
        if not row:
            raise NotFoundError("Die Firma")
        return row

    def find_company(self, name: str) -> dict | None:
        """Exakter Treffer ueber Name oder Alias (normalisiert)."""
        n = norm_text(name)
        if not n:
            return None
        row = self.v.row("SELECT id, name FROM company WHERE name_norm = ?", (n,))
        if row:
            return row
        return self.v.row(
            "SELECT c.id, c.name FROM company_alias a JOIN company c ON c.id = a.company_id"
            " WHERE a.alias_norm = ?",
            (n,),
        )

    def similar_companies(self, name: str, limit: int = 3) -> list[dict]:
        """Dublettenvorschlag: aehnliche Namen oder Aliase (Aehnlichkeit/Teilstring)."""
        n = norm_text(name)
        if not n:
            return []
        scored: dict[int, tuple[float, dict]] = {}
        names = [(c["id"], c["name"], norm_text(c["name"])) for c in self.list_companies()]
        for c in self.list_companies():
            for a in c["aliases"]:
                names.append((c["id"], c["name"], norm_text(a)))
        for cid, cname, cn in names:
            if cn == n:
                continue
            ratio = difflib.SequenceMatcher(None, n, cn).ratio()
            if len(n) >= 4 and len(cn) >= 4 and (n in cn or cn in n):
                ratio = max(ratio, 0.85)
            if ratio >= 0.8 and ratio > scored.get(cid, (0, {}))[0]:
                scored[cid] = (ratio, {"id": cid, "name": cname, "score": round(ratio, 2)})
        return [x[1] for x in sorted(scored.values(), key=lambda t: -t[0])][:limit]

    def create_company(self, name: str) -> dict:
        name = " ".join(name.split())
        if not name or len(name) > 120:
            raise ArchiveError("Bitte einen Firmennamen (bis 120 Zeichen) angeben.", "ungueltig")
        found = self.find_company(name)
        if found:
            return found
        with self.v.tx():
            cur = self.v.execute(
                "INSERT INTO company (name, name_norm, created_at) VALUES (?,?,?)",
                (name, norm_text(name), now_iso()),
            )
            self.v.audit("company.created")
        return {"id": cur.lastrowid, "name": name}

    def rename_company(self, company_id: int, name: str) -> dict:
        self.get_company(company_id)
        name = " ".join(name.split())
        other = self.find_company(name)
        if other and other["id"] != company_id:
            raise ArchiveError("Diese Firma gibt es schon.", "doppelt", 409)
        self.v.execute(
            "UPDATE company SET name = ?, name_norm = ? WHERE id = ?",
            (name, norm_text(name), company_id),
        )
        return self.get_company(company_id)

    def add_alias(self, company_id: int, alias: str) -> None:
        self.get_company(company_id)
        n = norm_text(alias)
        if not n:
            raise ArchiveError("Bitte einen Alias angeben.", "ungueltig")
        other = self.find_company(alias)
        if other and other["id"] != company_id:
            raise ArchiveError("Dieser Name gehört schon zu einer anderen Firma.", "doppelt", 409)
        if other:
            return
        self.v.execute(
            "INSERT INTO company_alias (company_id, alias, alias_norm) VALUES (?,?,?)",
            (company_id, " ".join(alias.split()), n),
        )

    def merge_companies(self, source_id: int, target_id: int) -> dict:
        """Fuehrt zwei Firmen zusammen. Der alte Name bleibt als Alias erhalten."""
        if source_id == target_id:
            raise ArchiveError("Das ist dieselbe Firma.", "ungueltig")
        src, dst = self.get_company(source_id), self.get_company(target_id)
        with self.v.tx():
            self.v.execute(
                "UPDATE document SET company_id = ? WHERE company_id = ?", (target_id, source_id)
            )
            self.v.execute(
                "UPDATE company_alias SET company_id = ? WHERE company_id = ?",
                (target_id, source_id),
            )
            self.v.execute(
                "UPDATE company SET name_norm = ? WHERE id = ?", (f"~{source_id}", source_id)
            )
            self.v.execute(
                "INSERT OR IGNORE INTO company_alias (company_id, alias, alias_norm) VALUES (?,?,?)",
                (target_id, src["name"], norm_text(src["name"])),
            )
            self.v.execute("DELETE FROM company WHERE id = ?", (source_id,))
            self.v.audit("company.merged")
        return dst

    # ------------------------------------------------------------------ Bereiche (Kategorien)

    def list_categories(self) -> list[dict]:
        return self.v.rows(
            "SELECT id, name, parent_id,"
            " (SELECT count(*) FROM document d WHERE d.category_id = category.id) AS documents"
            " FROM category ORDER BY name COLLATE NOCASE"
        )

    def create_category(self, name: str, parent_id: int | None = None) -> dict:
        name = " ".join(name.split())
        if not name:
            raise ArchiveError("Bitte einen Namen angeben.", "ungueltig")
        if parent_id is not None and not self.v.row(
            "SELECT 1 FROM category WHERE id=?", (parent_id,)
        ):
            raise NotFoundError("Der übergeordnete Bereich")
        row = self.v.row(
            "SELECT id, name, parent_id FROM category WHERE IFNULL(parent_id,0) = ? AND name = ?"
            " COLLATE NOCASE",
            (parent_id or 0, name),
        )
        if row:
            return row
        cur = self.v.execute(
            "INSERT INTO category (name, parent_id) VALUES (?,?)", (name, parent_id)
        )
        return {"id": cur.lastrowid, "name": name, "parent_id": parent_id}

    def find_category(self, name: str) -> dict | None:
        return self.v.row("SELECT id, name FROM category WHERE name = ? COLLATE NOCASE", (name,))

    # ------------------------------------------------------------------ Tags

    def list_tags(self) -> list[dict]:
        return self.v.rows(
            "SELECT t.id, t.name, t.color,"
            " (SELECT count(*) FROM document_tag dt WHERE dt.tag_id = t.id) AS documents"
            " FROM tag t ORDER BY t.name COLLATE NOCASE"
        )

    def create_tag(self, name: str, color: str = "#3b82f6") -> dict:
        name = " ".join(name.split())
        if not name or len(name) > 40:
            raise ArchiveError("Ein Tag hat 1 bis 40 Zeichen.", "ungueltig")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ArchiveError("Farbe als #rrggbb angeben.", "ungueltig")
        row = self.v.row("SELECT id, name, color FROM tag WHERE name = ?", (name,))
        if row:
            return row
        cur = self.v.execute("INSERT INTO tag (name, color) VALUES (?,?)", (name, color))
        return {"id": cur.lastrowid, "name": name, "color": color}

    def update_tag(self, tag_id: int, name: str | None, color: str | None) -> dict:
        row = self.v.row("SELECT id, name, color FROM tag WHERE id = ?", (tag_id,))
        if not row:
            raise NotFoundError("Der Tag")
        name = " ".join((name or row["name"]).split())
        color = color or row["color"]
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ArchiveError("Farbe als #rrggbb angeben.", "ungueltig")
        clash = self.v.row("SELECT id FROM tag WHERE name = ? AND id <> ?", (name, tag_id))
        if clash:
            raise ArchiveError("Diesen Tag gibt es schon.", "doppelt", 409)
        self.v.execute("UPDATE tag SET name = ?, color = ? WHERE id = ?", (name, color, tag_id))
        return {"id": tag_id, "name": name, "color": color}

    def delete_tag(self, tag_id: int) -> None:
        """Entfernt nur das Etikett, nie ein Dokument."""
        with self.v.tx():
            self.v.execute("DELETE FROM document_tag WHERE tag_id = ?", (tag_id,))
            self.v.execute("DELETE FROM tag WHERE id = ?", (tag_id,))

    def set_document_tags(self, document_id: int, tag_ids: list[int]) -> list[dict]:
        self._doc_row(document_id)
        ids = sorted(set(tag_ids))
        known = {r["id"] for r in self.v.rows("SELECT id FROM tag")}
        if not set(ids) <= known:
            raise NotFoundError("Ein Tag")
        with self.v.tx():
            self.v.execute("DELETE FROM document_tag WHERE document_id = ?", (document_id,))
            for tid in ids:
                self.v.execute(
                    "INSERT INTO document_tag (document_id, tag_id) VALUES (?,?)",
                    (document_id, tid),
                )
            self.v.audit("document.tags_changed", document_id=document_id, field="tags")
        return self.document_tags(document_id)

    def document_tags(self, document_id: int) -> list[dict]:
        return self.v.rows(
            "SELECT t.id, t.name, t.color FROM document_tag dt JOIN tag t ON t.id = dt.tag_id"
            " WHERE dt.document_id = ? ORDER BY t.name COLLATE NOCASE",
            (document_id,),
        )

    # ------------------------------------------------------------------ Kennungen

    def set_references(self, document_id: int, refs: list[dict], source: str = "manuell") -> None:
        self._doc_row(document_id)
        with self.v.tx():
            self.v.execute("DELETE FROM reference_number WHERE document_id = ?", (document_id,))
            seen = set()
            for r in refs:
                typ, value = r.get("type"), str(r.get("value", "")).strip()
                if typ not in REF_TYPES or not value:
                    continue
                norm = norm_ref(value)
                if len(norm) < 3 or (typ, norm) in seen:
                    continue
                seen.add((typ, norm))
                self.v.execute(
                    "INSERT INTO reference_number (document_id, type, value, value_norm, source,"
                    " confirmed) VALUES (?,?,?,?,?,?)",
                    (document_id, typ, value[:80], norm, r.get("source", source),
                     1 if r.get("confirmed", source == "manuell") else 0),
                )  # fmt: skip

    def document_references(self, document_id: int) -> list[dict]:
        return self.v.rows(
            "SELECT id, type, value, value_norm, source, confirmed FROM reference_number"
            " WHERE document_id = ? ORDER BY id",
            (document_id,),
        )

    # ------------------------------------------------------------------ Dokumente

    def _doc_row(self, document_id: int) -> dict:
        row = self.v.row(f"SELECT {DOC_COLUMNS}{DOC_FROM} WHERE d.id = ?", (document_id,))
        if not row:
            raise NotFoundError("Das Dokument")
        return row

    def display_name(self, doc: dict) -> str:
        s = self.get_settings()
        ext = MIME_EXT.get(doc["mime"], "")
        if not s["display_name_enabled"]:
            return doc["original_name"]
        parts = {
            "firma": doc.get("company_name") or "",
            "art": doc.get("doc_type") or "",
            "bereich": doc.get("category_name") or "",
            "datum": (doc.get("doc_date") or "")[:10],
            "jahr": (doc.get("doc_date") or "")[:4],
            "monat": (doc.get("doc_date") or "")[5:7],
            "betrag": format_eur(doc["amount_cents"])
            if doc.get("amount_cents") is not None
            else "",
            "name": re.sub(r"\.[A-Za-z0-9]{1,5}$", "", doc["original_name"]),
        }
        tokens = re.split(r"(\{[a-z]+\})", str(s["display_name_template"]))
        out = []
        for tok in tokens:
            m = re.fullmatch(r"\{([a-z]+)\}", tok)
            if not m:
                out.append(tok)
            elif parts.get(m.group(1)):
                out.append(parts[m.group(1)])
            else:
                out.append("\0")
        text = "".join(out)
        text = re.sub(r"(?:[\s_\-]*\0)+[\s_\-]*", "_", text).strip("_ -")
        text = re.sub(r"[\\/:*?\"<>|]", "-", text)
        if not text.strip("_ -\0"):
            return doc["original_name"]
        return text + ext

    def decorate(self, doc: dict) -> dict:
        doc = dict(doc)
        doc["display_name"] = self.display_name(doc)
        doc["paid"] = bool(doc["paid"])
        doc["archived"] = bool(doc["archived"])
        doc["amount"] = format_eur(doc["amount_cents"])
        return doc

    def get_document(self, document_id: int) -> dict:
        doc = self.decorate(self._doc_row(document_id))
        doc["tags"] = self.document_tags(document_id)
        doc["parts"] = self.v.rows(
            "SELECT page, name, mime, size, sha256 FROM blob_store WHERE document_id = ?"
            " ORDER BY page",
            (document_id,),
        )
        doc["references"] = self.document_references(document_id)
        doc["extractions"] = self.latest_extractions(document_id)
        doc["history"] = self.v.rows(
            "SELECT field, old, new, changed_at, by FROM field_history WHERE document_id = ?"
            " ORDER BY id DESC",
            (document_id,),
        )
        return doc

    def latest_extractions(self, document_id: int) -> list[dict]:
        run = self.v.scalar(
            "SELECT run_id FROM extraction WHERE document_id = ? ORDER BY id DESC LIMIT 1",
            (document_id,),
        )
        if not run:
            return []
        return self.v.rows(
            "SELECT field, value, confidence, source FROM extraction WHERE document_id = ?"
            " AND run_id = ? ORDER BY id",
            (document_id, run),
        )

    def list_documents(
        self,
        *,
        q: str | None = None,
        company_id: int | None = None,
        doc_type: str | None = None,
        category_id: int | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        amount_min: int | None = None,
        amount_max: int | None = None,
        tag_ids: list[int] | None = None,
        paid: bool | None = None,
        state: str | None = None,
        archived: str = "nein",
        sort: str = "datum_ab",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        where, params = [], []
        if archived == "nein":
            where.append("d.archived = 0")
        elif archived == "nur":
            where.append("d.archived = 1")
        elif archived != "ja":
            raise ArchiveError("Ungültiger Archivfilter.", "ungueltig")
        if q and q.strip():
            ids = self.v.search(q, include_archived=True)
            like = f"%{q.strip().lower()}%"
            amount_hint = re.sub(r"[^\d,]", "", q)
            clause = (
                "(lower(c.name) LIKE ? OR lower(IFNULL(d.doc_type,'')) LIKE ?"
                " OR lower(d.original_name) LIKE ? OR lower(IFNULL(d.note,'')) LIKE ?"
                " OR lower(IFNULL(cat.name,'')) LIKE ? OR EXISTS (SELECT 1 FROM reference_number r"
                " WHERE r.document_id = d.id AND r.value_norm LIKE ?)"
                " OR EXISTS (SELECT 1 FROM document_tag dt JOIN tag t ON t.id = dt.tag_id"
                " WHERE dt.document_id = d.id AND lower(t.name) LIKE ?)"
            )
            params += [like] * 5 + [f"%{norm_ref(q)}%" if norm_ref(q) else "%\0%", like]
            if amount_hint and re.fullmatch(r"\d+(,\d{1,2})?", amount_hint):
                cents = int(amount_hint.partition(",")[0]) * 100 + int(
                    (amount_hint.partition(",")[2] or "0").ljust(2, "0")
                )
                clause += " OR d.amount_cents = ?"
                params.append(cents)
            if ids:
                clause += f" OR d.id IN ({','.join('?' * len(ids))})"
                params += ids
            where.append(clause + ")")
        for col, val in (
            ("d.company_id", company_id),
            ("d.doc_type", doc_type),
            ("d.category_id", category_id),
            ("d.state", state),
        ):
            if val is not None:
                where.append(f"{col} = ?")
                params.append(val)
        if date_from:
            where.append("d.doc_date >= ?")
            params.append(date_from)
        if date_to:
            where.append("d.doc_date <= ?")
            params.append(date_to)
        if amount_min is not None:
            where.append("d.amount_cents >= ?")
            params.append(amount_min)
        if amount_max is not None:
            where.append("d.amount_cents <= ?")
            params.append(amount_max)
        if paid is not None:
            where.append("d.paid = ?")
            params.append(1 if paid else 0)
        for tid in tag_ids or []:
            where.append(
                "EXISTS (SELECT 1 FROM document_tag dt WHERE dt.document_id = d.id AND dt.tag_id = ?)"
            )
            params.append(tid)
        order = {
            "datum_ab": "d.doc_date DESC, d.id DESC",
            "datum_auf": "d.doc_date ASC, d.id ASC",
            "betrag_ab": "d.amount_cents DESC, d.id DESC",
            "betrag_auf": "d.amount_cents ASC, d.id ASC",
            "import_ab": "d.id DESC",
            "firma": "c.name COLLATE NOCASE ASC, d.id DESC",
        }.get(sort)
        if not order:
            raise ArchiveError("Ungültige Sortierung.", "ungueltig")
        clause = (" WHERE " + " AND ".join(where)) if where else ""
        total = self.v.scalar(f"SELECT count(*){DOC_FROM}{clause}", params)
        rows = self.v.rows(
            f"SELECT {DOC_COLUMNS}{DOC_FROM}{clause} ORDER BY {order} LIMIT ? OFFSET ?",
            [*params, max(1, min(limit, 500)), max(0, offset)],
        )
        items = [self.decorate(r) for r in rows]
        if items:
            tags: dict[int, list[dict]] = {}
            ids = [i["id"] for i in items]
            for t in self.v.rows(
                "SELECT dt.document_id, t.id, t.name, t.color FROM document_tag dt JOIN tag t"
                f" ON t.id = dt.tag_id WHERE dt.document_id IN ({','.join('?' * len(ids))})",
                ids,
            ):
                tags.setdefault(t.pop("document_id"), []).append(t)
            for i in items:
                i["tags"] = tags.get(i["id"], [])
        return {"items": items, "total": total}

    # --- Aenderungen

    def _validate_fields(self, fields: dict) -> dict:
        out = {}
        for k, val in fields.items():
            if k not in EDITABLE_FIELDS:
                raise ArchiveError(f"Das Feld „{k}“ kann nicht geändert werden.", "ungueltig")
            if k == "doc_date":
                if val in (None, ""):
                    val = None
                elif not valid_iso_date(val):
                    raise ArchiveError("Das Datum ist ungültig (JJJJ-MM-TT).", "ungueltig")
            elif k == "amount_cents":
                if val is not None and (
                    not isinstance(val, int) or isinstance(val, bool) or abs(val) > 10**11
                ):
                    raise ArchiveError("Der Betrag ist ungültig.", "ungueltig")
            elif k == "company_id" and val is not None:
                self.get_company(val)
            elif k == "category_id" and val is not None:
                if not self.v.row("SELECT 1 FROM category WHERE id = ?", (val,)):
                    raise NotFoundError("Der Bereich")
            elif k == "doc_type":
                val = (val or "").strip() or None
                if val and len(val) > 60:
                    raise ArchiveError("Die Art ist zu lang.", "ungueltig")
            elif k == "note":
                val = (val or "").strip() or None
                if val and len(val) > 4000:
                    raise ArchiveError("Die Notiz ist zu lang.", "ungueltig")
            out[k] = val
        return out

    def update_document(self, document_id: int, fields: dict, by: str = "nutzer") -> dict:
        fields = self._validate_fields(fields)
        with self.v.tx():
            self._apply_fields(document_id, fields, by)
        return self.get_document(document_id)

    def _apply_fields(self, document_id: int, fields: dict, by: str) -> None:
        cur = self._doc_row(document_id)
        for k, new in fields.items():
            old = cur[k]
            if old == new:
                continue
            self.v.execute(f"UPDATE document SET {k} = ? WHERE id = ?", (new, document_id))
            if old is not None or cur["state"] == "geprueft":
                self.v.execute(
                    "INSERT INTO field_history (document_id, field, old, new, changed_at, by)"
                    " VALUES (?,?,?,?,?,?)",
                    (document_id, k, None if old is None else str(old),
                     None if new is None else str(new), now_iso(), by),
                )  # fmt: skip
            self.v.audit("document.corrected", document_id=document_id, field=k)

    def confirm_document(
        self,
        document_id: int,
        fields: dict,
        *,
        company_name: str | None = None,
        create_company: bool = False,
        references: list[dict] | None = None,
        deadlines: list[dict] | None = None,
        by: str = "nutzer",
    ) -> dict:
        """Validierungsschritt: Werte uebernehmen, Fristen bestaetigen, Zustand `geprueft`."""
        from .deadlines import Deadlines

        self._doc_row(document_id)
        if self.v.scalar(
            "SELECT count(*) FROM job WHERE document_id = ? AND state IN ('wartend','laeuft')",
            (document_id,),
        ):
            raise ArchiveError("Das Dokument wird noch erkannt.", "in_arbeit", 409)
        fields = dict(fields)
        if company_name is not None and company_name.strip():
            found = self.find_company(company_name)
            if found:
                fields["company_id"] = found["id"]
            elif create_company:
                fields["company_id"] = self.create_company(company_name)["id"]
            else:
                raise ArchiveError(
                    f"„{company_name.strip()}“ ist noch nicht angelegt.",
                    "neue_firma",
                    409,
                    name=company_name.strip(),
                    similar=self.similar_companies(company_name),
                )
        fields = self._validate_fields(fields)
        dl = Deadlines(self)
        with self.v.tx():
            self._apply_fields(document_id, fields, by)
            if references is not None:
                self.set_references(document_id, references)
            else:
                self.v.execute(
                    "UPDATE reference_number SET confirmed = 1 WHERE document_id = ?",
                    (document_id,),
                )
            for spec in deadlines or []:
                dl.save_from_review(document_id, spec)
            self.v.execute(
                "UPDATE document SET state = 'geprueft', reviewed_at = ? WHERE id = ?",
                (now_iso(), document_id),
            )
            self.v.audit("document.confirmed", document_id=document_id)
        return self.get_document(document_id)

    def batch_confirm(self, document_ids: list[int] | None = None) -> dict:
        """Sammelbestaetigung bei hoher Konfidenz. Fristen und neue Firmen bleiben Handarbeit."""
        s = self.get_settings()
        if not s["batch_confirm_enabled"]:
            raise ArchiveError("Die Sammelbestätigung ist ausgeschaltet.", "abgeschaltet", 403)
        threshold = float(s["batch_confirm_threshold"])
        confirmed, skipped = [], []
        cands = document_ids or [
            r["id"]
            for r in self.v.rows("SELECT id FROM document WHERE state='erkannt' AND archived=0")
        ]
        for did in cands:
            doc = self._doc_row(did)
            ok = doc["state"] == "erkannt" and doc["company_id"] is not None
            conf = {e["field"]: e["confidence"] for e in self.latest_extractions(did)}
            for field in ("firma", "datum", "betrag"):
                if field == "betrag" and doc["amount_cents"] is None:
                    continue
                if conf.get(field, 0) < threshold:
                    ok = False
            if doc["doc_date"] is None:
                ok = False
            if self.v.scalar(
                "SELECT count(*) FROM deadline WHERE document_id = ? AND confirmed = 0", (did,)
            ):
                ok = False
            if ok:
                self.confirm_document(did, {})
                confirmed.append(did)
            else:
                skipped.append(did)
        return {"confirmed": confirmed, "skipped": skipped}

    def archive_document(self, document_id: int, reason: str) -> dict:
        self._doc_row(document_id)
        try:
            self.v.archive(document_id, reason)
        except ValueError as exc:
            raise ArchiveError("Bitte einen Grund fürs Archivieren angeben.", "ungueltig") from exc
        return self.get_document(document_id)

    def restore_document(self, document_id: int) -> dict:
        self._doc_row(document_id)
        self.v.restore(document_id)
        return self.get_document(document_id)

    def set_paid(self, document_id: int, paid: bool, paid_at: str | None = None) -> dict:
        from .deadlines import Deadlines

        self._doc_row(document_id)
        if paid_at and not valid_iso_date(paid_at):
            raise ArchiveError("Das Datum ist ungültig.", "ungueltig")
        with self.v.tx():
            self.v.execute(
                "UPDATE document SET paid = ?, paid_at = ? WHERE id = ?",
                (
                    1 if paid else 0,
                    (paid_at or self.today().isoformat()) if paid else None,
                    document_id,
                ),
            )
            self.v.audit("document.paid_changed", document_id=document_id, field="paid")
            Deadlines(self).on_paid_changed(document_id, paid)
        return self.get_document(document_id)

    # ------------------------------------------------------------------ Startseite

    def dashboard(self) -> dict:
        from .deadlines import Deadlines

        today = self.today()
        waiting_files = self.v.scalar(
            "SELECT count(*) FROM import_file f JOIN import_batch b ON b.id = f.batch_id"
            " WHERE f.state = 'wartet' AND b.status = 'wartet'"
        )
        to_review = self.v.scalar(
            "SELECT count(*) FROM document WHERE state = 'erkannt' AND archived = 0"
        )
        processing = self.v.scalar(
            "SELECT count(*) FROM document WHERE state IN ('eingegangen','verarbeitet')"
            " AND archived = 0"
        )
        dl = Deadlines(self)
        upcoming = dl.list(within_days=30, include_overdue=True)
        recent = self.v.rows(
            f"SELECT {DOC_COLUMNS}{DOC_FROM} WHERE d.state = 'geprueft' AND d.archived = 0"
            " ORDER BY d.reviewed_at DESC LIMIT 5"
        )
        return {
            "waiting_files": waiting_files,
            "to_review": to_review,
            "processing": processing,
            "upcoming": upcoming,
            "recent": [self.decorate(r) for r in recent],
            "documents_total": self.v.scalar("SELECT count(*) FROM document WHERE archived = 0"),
            "today": today.isoformat(),
        }

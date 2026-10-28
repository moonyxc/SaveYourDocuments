"""Export-Engine (PLAN 4.6): Vorlage fuer Pfad und Dateiname, sichere Namen, Vorschau, ZIP.

Der Export ist rein lesend: das Archiv wird nie veraendert (ausser einem Audit-Eintrag).
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

from .repo import MIME_EXT, ArchiveError, NotFoundError, Repo
from .util import format_eur

TOKENS = ("firma", "bereich", "art", "jahr", "monat", "datum", "betrag", "name", "id")
_TOKEN_RE = re.compile(r"\{([a-z]+)\}")
_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
FALLBACK = "Unbekannt"
MAX_SEGMENT = 80
MAX_PATH = 220


def safe_segment(text: str, fallback: str = FALLBACK) -> str:
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", text)
    s = re.sub(r"\s+", " ", s).strip(" .")
    if not s:
        return fallback
    if s.split(".")[0].upper() in _RESERVED:
        s = "_" + s
    return s[:MAX_SEGMENT].rstrip(" .") or fallback


def validate_template(path_t: str, file_t: str) -> None:
    for label, t in (("Ordner", path_t), ("Dateiname", file_t)):
        for tok in _TOKEN_RE.findall(t):
            if tok not in TOKENS:
                raise ArchiveError(
                    f"Unbekannter Platzhalter {{{tok}}} in der Vorlage ({label}). Erlaubt: "
                    + ", ".join("{" + x + "}" for x in TOKENS),
                    "ungueltig",
                )
    if not file_t.strip():
        raise ArchiveError("Der Dateiname braucht eine Vorlage.", "ungueltig")
    if re.match(r"^([A-Za-z]:|[/\\])", path_t.strip()) or ".." in re.split(r"[/\\]", path_t):
        raise ArchiveError(
            "Die Ordner-Vorlage muss relativ sein (kein Laufwerk, kein „..“).", "ungueltig"
        )


class Exporter:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.v = repo.v

    # --- Vorlagen
    def templates(self) -> list[dict]:
        rows = self.v.rows(
            "SELECT id, name, path_template, file_template, include_archived FROM export_template ORDER BY id"
        )
        for r in rows:
            r["include_archived"] = bool(r["include_archived"])
        return rows

    def save_template(
        self,
        name: str,
        path_t: str,
        file_t: str,
        include_archived: bool,
        template_id: int | None = None,
    ) -> dict:
        name = name.strip()
        if not name:
            raise ArchiveError("Bitte einen Namen für die Vorlage angeben.", "ungueltig")
        validate_template(path_t, file_t)
        if template_id:
            if not self.v.row("SELECT 1 FROM export_template WHERE id = ?", (template_id,)):
                raise NotFoundError("Die Vorlage")
            self.v.execute(
                "UPDATE export_template SET name=?, path_template=?, file_template=?, include_archived=? WHERE id=?",
                (name, path_t.strip(), file_t.strip(), int(include_archived), template_id),
            )
            return {"id": template_id}
        if self.v.row("SELECT 1 FROM export_template WHERE name = ?", (name,)):
            raise ArchiveError("Eine Vorlage mit diesem Namen gibt es schon.", "doppelt", 409)
        cur = self.v.execute(
            "INSERT INTO export_template (name, path_template, file_template, include_archived) VALUES (?,?,?,?)",
            (name, path_t.strip(), file_t.strip(), int(include_archived)),
        )
        return {"id": cur.lastrowid}

    def delete_template(self, template_id: int) -> None:
        if self.v.scalar("SELECT count(*) FROM export_template") <= 1:
            raise ArchiveError("Mindestens eine Vorlage muss bleiben.", "ungueltig")
        self.v.execute("DELETE FROM export_template WHERE id = ?", (template_id,))

    # --- Planung
    def _values(self, doc: dict) -> dict[str, str]:
        date_ = doc.get("doc_date") or ""
        return {
            "firma": doc.get("company_name") or "",
            "bereich": doc.get("category_name") or "",
            "art": doc.get("doc_type") or "",
            "jahr": date_[:4],
            "monat": date_[5:7],
            "datum": date_,
            "betrag": format_eur(doc["amount_cents"]).replace(" €", "EUR")
            if doc.get("amount_cents") is not None
            else "",
            "name": re.sub(r"\.[A-Za-z0-9]{1,5}$", "", doc["original_name"]),
            "id": str(doc["id"]),
        }

    def _render(self, template: str, values: dict[str, str]) -> str:
        return _TOKEN_RE.sub(lambda m: safe_segment(values.get(m.group(1), ""), FALLBACK), template)

    def plan(
        self,
        template_id: int | None = None,
        *,
        path_template: str | None = None,
        file_template: str | None = None,
        include_archived: bool | None = None,
        include_unreviewed: bool = False,
        document_ids: list[int] | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        if template_id is not None:
            t = self.v.row("SELECT * FROM export_template WHERE id = ?", (template_id,))
            if not t:
                raise NotFoundError("Die Vorlage")
            path_template = path_template or t["path_template"]
            file_template = file_template or t["file_template"]
            if include_archived is None:
                include_archived = bool(t["include_archived"])
        path_template = path_template if path_template is not None else "{firma}/{jahr}"
        file_template = file_template or "{datum}_{art}_{betrag}"
        validate_template(path_template, file_template)
        flt = dict(filters or {})
        flt["archived"] = "ja" if include_archived else "nein"
        if not include_unreviewed:
            flt.setdefault("state", "geprueft")
        docs = self.repo.list_documents(**flt, limit=500, offset=0)["items"]
        total = self.repo.list_documents(**flt, limit=1, offset=0)["total"]
        if total > 500:
            docs = []
            offset = 0
            while offset < total:
                docs += self.repo.list_documents(**flt, limit=500, offset=offset)["items"]
                offset += 500
        if document_ids is not None:
            wanted = set(document_ids)
            docs = [d for d in docs if d["id"] in wanted]
        used: set[str] = set()
        out = []
        for d in docs:
            vals = self._values(d)
            folder = [
                safe_segment(self._render(seg, vals))
                for seg in re.split(r"[/\\]", path_template)
                if seg.strip()
            ]
            base = safe_segment(self._render(file_template, vals))
            parts = self.v.rows(
                "SELECT page, mime FROM blob_store WHERE document_id = ? ORDER BY page", (d["id"],)
            )
            for p in parts:
                suffix = f"_S{p['page']}" if len(parts) > 1 else ""
                ext = MIME_EXT.get(p["mime"], "")
                stem = (
                    base[: max(10, MAX_PATH - len("/".join(folder)) - len(ext) - len(suffix) - 8)]
                    + suffix
                )
                rel = "/".join([*folder, stem + ext])
                n = 1
                while rel.lower() in used:
                    n += 1
                    rel = "/".join([*folder, f"{stem} ({n}){ext}"])
                used.add(rel.lower())
                out.append(
                    {
                        "document_id": d["id"],
                        "page": p["page"],
                        "target": rel,
                        "archived": d["archived"],
                    }
                )
        return out

    # --- Ausfuehrung
    def run(self, plan: list[dict], dest: Path, *, as_zip: bool = False) -> dict:
        dest = Path(dest)
        if not plan:
            raise ArchiveError("Es gibt nichts zu exportieren.", "leer")
        files = 0
        nbytes = 0
        if as_zip:
            if dest.suffix.lower() != ".zip":
                dest = dest.with_suffix(".zip")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(dest, "w", zipfile.ZIP_STORED) as zf:
                for item in plan:
                    with zf.open(item["target"], "w", force_zip64=True) as out:
                        for chunk in self.v.stream_page(item["document_id"], item["page"]):
                            out.write(chunk)
                            nbytes += len(chunk)
                    files += 1
        else:
            dest.mkdir(parents=True, exist_ok=True)
            root = dest.resolve()
            for item in plan:
                target = (dest / item["target"]).resolve()
                if root not in target.parents:
                    raise ArchiveError("Ungültiger Zielpfad in der Vorlage.", "ungueltig")
                target.parent.mkdir(parents=True, exist_ok=True)
                with (
                    target.open("xb") if not target.exists() else _unique(target).open("xb") as out
                ):
                    for chunk in self.v.stream_page(item["document_id"], item["page"]):
                        out.write(chunk)
                        nbytes += len(chunk)
                files += 1
        with self.v.tx():
            for did in sorted({i["document_id"] for i in plan}):
                self.v.audit("document.exported", document_id=did)
            self.v.audit("export.done")
        return {"files": files, "bytes": nbytes, "destination": str(dest)}


def _unique(path: Path) -> Path:
    n = 2
    while True:
        cand = path.with_name(f"{path.stem} ({n}){path.suffix}")
        if not cand.exists():
            return cand
        n += 1

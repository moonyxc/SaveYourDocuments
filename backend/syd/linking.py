"""Verknuepfungsvorschlaege zwischen Dokumenten (PLAN 4.9). Exakter Vergleich, kein Fuzzy."""

from __future__ import annotations

import re
from datetime import date

from .repo import ArchiveError, NotFoundError, Repo
from .util import now_iso

LINK_TYPES = ("antwort_auf", "gehoert_zu", "ersetzt")
ANSWER_TYPES = {"Mahnung", "Zahlungsbeleg", "Kündigungsbestätigung", "Bescheid", "Schreiben"}
SCORE_STRONG, SCORE_MEDIUM = 100, 60

_REF_TEXT = re.compile(
    r"(?:ihr(?:e|es|em)?\s+(?:schreiben|brief|rechnung|antrag|zeichen)|bezug|ihre\s+nachricht)"
    r"[^\n.]{0,40}?\bvom\s+(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})",
    re.IGNORECASE,
)


def referenced_dates(text: str) -> set[str]:
    out = set()
    for m in _REF_TEXT.finditer(text):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y += 2000 if y < 100 else 0
        try:
            out.add(date(y, mo, d).isoformat())
        except ValueError:
            continue
    return out


class Linking:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.v = repo.v

    def _guess_type(self, a: dict, b: dict) -> tuple[int, int, str]:
        """Liefert (from_id, to_id, typ): das spaetere Dokument verweist auf das fruehere."""
        da, db = a["doc_date"] or "", b["doc_date"] or ""
        later, earlier = (a, b) if (da, a["id"]) >= (db, b["id"]) else (b, a)
        typ = "antwort_auf" if later["doc_type"] in ANSWER_TYPES else "gehoert_zu"
        return later["id"], earlier["id"], typ

    def suggest(self, document_id: int) -> list[dict]:
        doc = self.repo._doc_row(document_id)
        scores: dict[int, tuple[int, list[str]]] = {}

        def bump(other: int, score: int, reason: str) -> None:
            cur = scores.get(other, (0, []))
            scores[other] = (max(cur[0], score), [*cur[1], reason])

        refs = self.repo.document_references(document_id)
        for r in refs:
            for o in self.v.rows(
                "SELECT DISTINCT r.document_id, d.company_id FROM reference_number r"
                " JOIN document d ON d.id = r.document_id"
                " WHERE r.value_norm = ? AND r.type = ? AND r.document_id <> ?",
                (r["value_norm"], r["type"], document_id),
            ):
                same_company = (
                    doc["company_id"] is not None and o["company_id"] == doc["company_id"]
                )
                label = {
                    "aktenzeichen": "Aktenzeichen",
                    "kundennummer": "Kundennummer",
                    "vertragsnummer": "Vertragsnummer",
                    "schadennummer": "Schadennummer",
                    "rechnungsnummer": "Rechnungsnummer",
                    "geschaeftszeichen": "Geschäftszeichen",
                }[r["type"]]
                if same_company:
                    bump(
                        o["document_id"],
                        SCORE_STRONG,
                        f"Gleiche Firma, gleiche {label} {r['value']}",
                    )
                else:
                    bump(
                        o["document_id"],
                        SCORE_MEDIUM,
                        f"Gleiche {label} {r['value']}, andere Firma",
                    )
        if doc["company_id"] is not None:
            text = " ".join(
                r["text"]
                for r in self.v.rows(
                    "SELECT text FROM ocr_text WHERE document_id = ?", (document_id,)
                )
            )
            for iso in referenced_dates(text):
                for o in self.v.rows(
                    "SELECT id FROM document WHERE company_id = ? AND doc_date = ? AND id <> ?",
                    (doc["company_id"], iso, document_id),
                ):
                    bump(
                        o["id"],
                        SCORE_MEDIUM,
                        f"Verweist auf ein Schreiben vom {iso[8:]}.{iso[5:7]}.{iso[:4]}",
                    )
        with self.v.tx():
            for other, (score, reasons) in scores.items():
                other_doc = self.repo._doc_row(other)
                from_id, to_id, typ = self._guess_type(doc, other_doc)
                existing = self.v.row(
                    "SELECT id, status FROM document_link WHERE MIN(from_id,to_id) = ? AND MAX(from_id,to_id) = ?",
                    (min(from_id, to_id), max(from_id, to_id)),
                )
                if existing:
                    if existing["status"] == "vorgeschlagen":
                        self.v.execute(
                            "UPDATE document_link SET score = ?, reason = ? WHERE id = ?",
                            (score, "; ".join(dict.fromkeys(reasons)), existing["id"]),
                        )
                    continue
                self.v.execute(
                    "INSERT INTO document_link (from_id, to_id, type, status, reason, score, created_at)"
                    " VALUES (?,?,?,'vorgeschlagen',?,?,?)",
                    (from_id, to_id, typ, "; ".join(dict.fromkeys(reasons)), score, now_iso()),
                )
        return self.links(document_id, include_suggested=True)

    def links(self, document_id: int, include_suggested: bool = True) -> list[dict]:
        statuses = ("bestaetigt", "vorgeschlagen") if include_suggested else ("bestaetigt",)
        rows = self.v.rows(
            "SELECT l.*, o.id AS other_id, o.doc_type AS other_type, o.doc_date AS other_date,"
            " o.original_name AS other_name, c.name AS other_company FROM document_link l"
            " JOIN document o ON o.id = CASE WHEN l.from_id = ? THEN l.to_id ELSE l.from_id END"
            " LEFT JOIN company c ON c.id = o.company_id"
            f" WHERE (l.from_id = ? OR l.to_id = ?) AND l.status IN ({','.join('?' * len(statuses))})"
            " ORDER BY l.score DESC, l.id",
            (document_id, document_id, document_id, *statuses),
        )
        out = []
        for r in rows:
            out.append(
                {
                    "id": r["id"],
                    "type": r["type"],
                    "status": r["status"],
                    "reason": r["reason"],
                    "score": r["score"],
                    "direction": "ausgehend" if r["from_id"] == document_id else "eingehend",
                    "other": {
                        "id": r["other_id"],
                        "doc_type": r["other_type"],
                        "doc_date": r["other_date"],
                        "company_name": r["other_company"],
                        "original_name": r["other_name"],
                    },
                }
            )
        return out

    def _link(self, link_id: int) -> dict:
        row = self.v.row("SELECT * FROM document_link WHERE id = ?", (link_id,))
        if not row:
            raise NotFoundError("Die Verknüpfung")
        return row

    def confirm(self, link_id: int, link_type: str | None = None) -> None:
        row = self._link(link_id)
        if link_type is not None and link_type not in LINK_TYPES:
            raise ArchiveError("Unbekannter Verknüpfungstyp.", "ungueltig")
        self.v.execute(
            "UPDATE document_link SET status = 'bestaetigt', type = ? WHERE id = ?",
            (link_type or row["type"], link_id),
        )
        self.v.audit("link.confirmed", document_id=row["from_id"])

    def reject(self, link_id: int) -> None:
        row = self._link(link_id)
        self.v.execute("UPDATE document_link SET status = 'abgelehnt' WHERE id = ?", (link_id,))
        self.v.audit("link.rejected", document_id=row["from_id"])

    def create(self, from_id: int, to_id: int, link_type: str) -> dict:
        if from_id == to_id:
            raise ArchiveError(
                "Ein Dokument kann nicht mit sich selbst verknüpft werden.", "ungueltig"
            )
        if link_type not in LINK_TYPES:
            raise ArchiveError("Unbekannter Verknüpfungstyp.", "ungueltig")
        self.repo._doc_row(from_id)
        self.repo._doc_row(to_id)
        existing = self.v.row(
            "SELECT id FROM document_link WHERE MIN(from_id,to_id) = ? AND MAX(from_id,to_id) = ?",
            (min(from_id, to_id), max(from_id, to_id)),
        )
        with self.v.tx():
            if existing:
                self.v.execute(
                    "UPDATE document_link SET from_id=?, to_id=?, type=?, status='bestaetigt' WHERE id=?",
                    (from_id, to_id, link_type, existing["id"]),
                )
                lid = existing["id"]
            else:
                lid = self.v.execute(
                    "INSERT INTO document_link (from_id, to_id, type, status, reason, score, created_at)"
                    " VALUES (?,?,?,'bestaetigt','Manuell verknüpft',0,?)",
                    (from_id, to_id, link_type, now_iso()),
                ).lastrowid
            self.v.audit("link.confirmed", document_id=from_id)
        return {"id": lid}

    def remove(self, link_id: int) -> None:
        """Loest eine bestaetigte Verknuepfung. Das Paar gilt danach als abgelehnt."""
        self.reject(link_id)

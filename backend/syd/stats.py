"""Auswertungen: Summen pro Firma, Jahr, Bereich (nur geprueft, nur Euro, PLAN 4.1)."""

from __future__ import annotations

import csv
import io

from .repo import ArchiveError, Repo
from .util import format_eur

DEFAULT_EXCLUDED = ("Mahnung", "Zahlungsbeleg")
GROUPS = {
    "firma": ("COALESCE(c.name, 'Ohne Firma')", "c.name COLLATE NOCASE"),
    "bereich": ("COALESCE(cat.name, 'Ohne Bereich')", "cat.name COLLATE NOCASE"),
    "art": ("COALESCE(d.doc_type, 'Ohne Art')", "d.doc_type"),
    "jahr": ("COALESCE(substr(d.doc_date, 1, 4), 'Ohne Datum')", "substr(d.doc_date,1,4)"),
    "monat": ("COALESCE(substr(d.doc_date, 1, 7), 'Ohne Datum')", "substr(d.doc_date,1,7)"),
}


def stats(
    repo: Repo,
    *,
    group_by: str = "firma",
    date_from: str | None = None,
    date_to: str | None = None,
    doc_types: list[str] | None = None,
    company_id: int | None = None,
    category_id: int | None = None,
    paid: bool | None = None,
) -> dict:
    if group_by not in GROUPS:
        raise ArchiveError("Ungültige Gruppierung.", "ungueltig")
    label_sql, _ = GROUPS[group_by]
    where = [
        "d.state = 'geprueft'",
        "d.archived = 0",
        "d.currency = 'EUR'",
        "d.amount_cents IS NOT NULL",
    ]
    params: list = []
    if doc_types is None:
        marks = ",".join("?" * len(DEFAULT_EXCLUDED))
        where.append(f"(d.doc_type IS NULL OR d.doc_type NOT IN ({marks}))")
        params += DEFAULT_EXCLUDED
    elif doc_types:
        where.append(f"d.doc_type IN ({','.join('?' * len(doc_types))})")
        params += doc_types
    if date_from:
        where.append("d.doc_date >= ?")
        params.append(date_from)
    if date_to:
        where.append("d.doc_date <= ?")
        params.append(date_to)
    if company_id is not None:
        where.append("d.company_id = ?")
        params.append(company_id)
    if category_id is not None:
        where.append("d.category_id = ?")
        params.append(category_id)
    if paid is not None:
        where.append("d.paid = ?")
        params.append(1 if paid else 0)
    base = (
        " FROM document d LEFT JOIN company c ON c.id = d.company_id"
        " LEFT JOIN category cat ON cat.id = d.category_id WHERE " + " AND ".join(where)
    )
    order = "label COLLATE NOCASE" if group_by in ("jahr", "monat") else "sum_cents DESC"
    rows = repo.v.rows(
        f"SELECT {label_sql} AS label, SUM(d.amount_cents) AS sum_cents, count(*) AS count{base}"
        f" GROUP BY label ORDER BY {order}",
        params,
    )
    months = repo.v.rows(
        "SELECT substr(d.doc_date, 1, 7) AS label, SUM(d.amount_cents) AS sum_cents, count(*) AS count"
        f"{base} AND d.doc_date IS NOT NULL GROUP BY label ORDER BY label",
        params,
    )
    total = sum(r["sum_cents"] for r in rows)
    for r in [*rows, *months]:
        r["sum"] = format_eur(r["sum_cents"])
        r["share"] = round(r["sum_cents"] / total, 4) if total and r["sum_cents"] > 0 else 0
    return {
        "group_by": group_by,
        "rows": rows,
        "by_month": months,
        "total_cents": total,
        "total": format_eur(total),
        "count": sum(r["count"] for r in rows),
        "excluded_types": list(DEFAULT_EXCLUDED) if doc_types is None else [],
    }


def to_csv(result: dict) -> str:
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(["Gruppe", "Summe in Euro", "Anzahl Dokumente", "Anteil"])
    for r in result["rows"]:
        w.writerow(
            [
                _csv_safe(r["label"]),
                f"{r['sum_cents'] / 100:.2f}".replace(".", ","),
                r["count"],
                f"{r['share'] * 100:.1f}".replace(".", ",") + " %",
            ]
        )
    w.writerow(
        ["Gesamt", f"{result['total_cents'] / 100:.2f}".replace(".", ","), result["count"], ""]
    )
    return "\ufeff" + out.getvalue()


def _csv_safe(value: str) -> str:
    """Schuetzt vor Formelinjektion in Tabellenkalkulationen."""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value

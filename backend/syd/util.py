"""Kleine Hilfsfunktionen: Normalisierung, Euro-Betraege, Datum."""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime

_UMLAUTS = str.maketrans(
    {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "ae", "Ö": "oe", "Ü": "ue"}
)


def norm_text(s: str) -> str:
    """Kleinschreibung, Umlaute aufgeloest, nur Buchstaben/Ziffern, einfache Leerzeichen."""
    s = s.translate(_UMLAUTS)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def norm_ref(s: str) -> str:
    """Kennung vergleichbar machen (4.9): Leerzeichen, Bindestriche, Gross/Klein vereinheitlichen."""
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def format_eur(cents: int | None) -> str:
    if cents is None:
        return ""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    whole, frac = divmod(cents, 100)
    return f"{sign}{whole:,}".replace(",", ".") + f",{frac:02d} €"


def parse_eur(text: str | int | float | None) -> int | None:
    """'1.234,56', '49,99 €', '49.99' -> Cent. None bei unlesbarem Wert."""
    if text is None or isinstance(text, bool):
        return None
    if isinstance(text, int):
        return text * 100
    if isinstance(text, float):
        return round(text * 100)
    t = re.sub(r"[€\sA-Za-z]", "", text)
    if not t or not re.fullmatch(r"-?[\d.,]+", t):
        return None
    if "," in t:
        whole, _, frac = t.rpartition(",")
        whole = whole.replace(".", "")
        if not re.fullmatch(r"-?\d+", whole or "0") or not re.fullmatch(r"\d{1,2}", frac):
            return None
        return int(whole or "0") * 100 + (
            int(frac.ljust(2, "0")) * (-1 if whole.startswith("-") else 1)
        )
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
        return int(t.replace(".", "")) * 100
    if re.fullmatch(r"-?\d+(\.\d{1,2})?", t):
        whole, _, frac = t.partition(".")
        v = abs(int(whole)) * 100 + int((frac or "0").ljust(2, "0"))
        return -v if whole.startswith("-") else v
    return None


def valid_iso_date(s: str | None) -> bool:
    if not s:
        return False
    try:
        date.fromisoformat(s)
    except ValueError:
        return False
    return len(s) == 10


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.year * 12 + d.month - 1 + months, 12)
    m += 1
    last = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30,
            31, 31, 30, 31, 30, 31][m - 1]  # fmt: skip
    return date(y, m, min(d.day, last))


def now_iso() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")

"""Regelbasierte Extraktion aus deutschem Dokumenttext (PLAN 4.1, D3).

Jeder Wert bekommt eine ehrliche Konfidenz. Fristen aus Rechenregeln sind immer unbestaetigt und
werden erst im Pruefschritt vom Nutzer bestaetigt.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from ..util import add_months, norm_text, parse_eur

MONTHS = {
    "januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5, "juni": 6,
    "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12,
}  # fmt: skip

_NUM_DATE = re.compile(r"(?<![\d.])(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?![\d])")
_TXT_DATE = re.compile(
    r"(?<!\d)(\d{1,2})\.?\s+(" + "|".join(MONTHS) + r")\s+(\d{4})(?!\d)", re.IGNORECASE
)
_ISO_DATE = re.compile(r"(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d])")

_AMOUNT = re.compile(
    r"(?:(?:€|EUR)\s?)?(?<![\d.,])(-?\d{1,3}(?:\.\d{3})+,\d{2}|-?\d+,\d{2})(?![\d,])(?:\s?(?:€|EUR|Euro))?"
)

DATE_POSITIVE = (
    "datum", "rechnungsdatum", "ausstellungsdatum", "belegdatum", "schreiben vom", ", den",
    "ausgestellt", "erstellt", "bescheid vom", "vom ", "stand",
)  # fmt: skip
DATE_NEGATIVE = (
    "fällig", "faellig", "zahlbar", "zahlungsziel", "bis ", "bis:", "ab ", "gültig", "laufzeit",
    "vertragsende", "geburt", "zeitraum", "stichtag", "kündigung", "frist", "spätestens",
    "ablauf", "leistung", "beginn", "versicherungsbeginn", "endet", "verbrauch", "ablesung",
    "termin", "bis zum", "innerhalb",
)  # fmt: skip

STRONG_AMOUNT = (
    "gesamtbetrag", "rechnungsbetrag", "zahlbetrag", "endbetrag", "zu zahlen", "zahlungsbetrag",
    "gesamtsumme", "offener betrag", "fälliger betrag", "rechnungssumme", "zu überweisen",
    "forderung", "gesamtforderung", "endsumme", "gesamtpreis", "summe brutto",
)  # fmt: skip
MEDIUM_AMOUNT = ("summe", "gesamt", "total", "betrag", "brutto", "beitrag", "preis", "kaufpreis")
EXCLUDE_AMOUNT = (
    "mwst", "ust", "umsatzsteuer", "mehrwertsteuer", "netto", "zwischensumme", "rabatt",
    "skonto", "versandkosten", "porto", "bereits gezahlt", "anzahlung", "guthaben", "pfand",
    "einzelpreis", "stückpreis", "stueckpreis", "pro monat", "/ monat", "mahngebühr", "mahnkosten",
    "zinsen", "verzugszinsen",
)  # fmt: skip

LEGAL_FORMS = re.compile(
    r"\b(gmbh(?: & co\.? ?kg)?|mbh|ag|kg|ohg|gbr|ug(?: \(haftungsbeschränkt\))?|e\. ?v\.|se|"
    r"kgaa|ltd|inc|stiftung|versicherung(?:en|sverein)?|bank|sparkasse|stadtwerke|"
    r"krankenkasse|finanzamt|hausverwaltung)\b",
    re.IGNORECASE,
)

TYPE_RULES: dict[str, list[tuple[str, int]]] = {
    "Mahnung": [(r"mahnung|zahlungserinnerung|inkasso|letzte aufforderung|zahlungsverzug", 4)],
    "Kündigungsbestätigung": [
        (r"kündigungsbestätigung|kuendigungsbestaetigung", 6),
        (r"bestätigen (?:wir )?(?:ihnen )?(?:hiermit )?(?:die |ihre )?kündigung", 5),
    ],
    "Kündigung": [(r"kündigung|hiermit kündige ich|kündige (?:ich )?(?:den|meinen|die)", 3)],
    "Beitragsrechnung": [
        (r"beitragsrechnung|beitragsanforderung|versicherungsbeitrag|beitragsfälligkeit", 5),
    ],
    "Zahlungsbeleg": [
        (r"zahlungsbestätigung|zahlungseingang|quittung|überweisungsbeleg|zahlungsbeleg", 5),
        (r"vielen dank für ihre zahlung|betrag (?:wurde )?erhalten", 3),
    ],
    "Kaufbeleg": [
        (r"kassenbon|kassenbeleg|kaufbeleg|kaufvertrag|bon-?nr|\bbar\b.*\bgegeben\b", 4),
        (r"vielen dank für ihren einkauf|zahlart", 2),
    ],
    "Versicherungsschein": [
        (r"versicherungsschein|\bpolice\b|versicherungsbestätigung|nachtrag zum versicherungsschein", 5),
    ],
    "Jahresabrechnung": [
        (r"jahresabrechnung|jahresrechnung|verbrauchsabrechnung|nebenkostenabrechnung|"
         r"jahresendabrechnung|jahresverbrauchsabrechnung", 5),
    ],  # fmt: skip
    "Schadenmeldung": [(r"schadenmeldung|schadensmeldung|schadenanzeige|schadenfall|schadennummer", 4)],
    "Bescheid": [
        (r"\bbescheid\b|steuerbescheid|festsetzung|einspruch|rechtsbehelf|widerspruch|finanzamt", 4),
    ],
    "Vertrag": [
        (r"\bvertrag\b|vertragsbestätigung|auftragsbestätigung|mietvertrag|vertragsnummer|laufzeit", 3),
    ],
    "Rechnung": [
        (r"\brechnung\b|rechnungsnummer|rechnungsdatum|rechnungsbetrag|invoice|zahlbar bis", 3),
    ],
}  # fmt: skip

CATEGORY_RULES: dict[str, str] = {
    "Versicherung": r"versicherung|\bpolice\b|haftpflicht|hausrat|schadenfall|versicherungsnehmer|\bvers\.",
    "Telefon & Internet": r"mobilfunk|\bdsl\b|internet|festnetz|rufnummer|telefon|\bflat\b|tarif|\bsim\b",
    "Strom & Gas": r"\bstrom\b|\bgas\b|\bkwh\b|stadtwerke|energie|zählerstand|abschlag|netzentgelt",
    "Steuern & Behörden": r"finanzamt|steuer|bescheid|behörde|gemeinde|bürgeramt|landratsamt|rundfunk",
    "Bank & Finanzen": r"sparkasse|\bbank\b|kontoauszug|kreditvertrag|darlehen|depot|zinsen",
    "Elektronik": r"notebook|smartphone|fernseher|kopfhörer|elektronik|mediamarkt|saturn|tablet",
    "Haushalt & Möbel": r"möbel|matratze|küche|haushalt|ikea|sofa|schrank",
    "Handwerker": r"handwerk|monteur|reparatur|installation|sanitär|elektriker|malerarbeiten|arbeitszeit|lohnkosten",
    "Gesundheit": r"\barzt\b|praxis|krankenkasse|apotheke|patient|diagnose|rezept|behandlung",
    "Wohnen & Miete": r"\bmiete\b|nebenkosten|vermieter|hausverwaltung|wohnung|mietvertrag",
    "Auto & Verkehr": r"\bkfz\b|fahrzeug|kennzeichen|\btüv\b|zulassung|führerschein|werkstatt",
    "Arbeit & Gehalt": r"gehalt|lohnabrechnung|arbeitgeber|entgelt|arbeitsvertrag|brutto/netto",
}

REF_PATTERNS: list[tuple[str, str]] = [
    ("kundennummer", r"kunden-?\s?(?:nr\.?|nummer)|kd\.?-?\s?nr\.?"),
    (
        "vertragsnummer",
        r"(?:vertrags|versicherungsschein|policen)-?\s?(?:nr\.?|nummer)|policennr\.?",
    ),
    ("rechnungsnummer", r"(?:rechnungs|beleg)-?\s?(?:nr\.?|nummer)|rechnung\s+nr\.?"),
    ("schadennummer", r"schaden(?:s)?-?\s?(?:nr\.?|nummer)"),
    ("geschaeftszeichen", r"ihr\s+zeichen|unser\s+zeichen|geschäftszeichen|ihre?\s+referenz"),
    ("aktenzeichen", r"aktenzeichen|\baz\.?"),
]
_REF_VALUE = r"\s*[:.]?\s*([A-Za-z0-9ÄÖÜ][A-Za-z0-9ÄÖÜ\-/.]{2,24}(?: \d{2,8})?)"


@dataclass
class Candidate:
    value: str | int | None
    confidence: float
    source: str = "regex"


@dataclass
class Extraction:
    fields: dict[str, Candidate] = field(default_factory=dict)
    company_id: int | None = None
    deadlines: list[dict] = field(default_factory=list)
    references: list[dict] = field(default_factory=list)

    def get(self, name: str) -> Candidate | None:
        return self.fields.get(name)


def _clean_lines(text: str) -> list[str]:
    return [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]


def _make_date(d: int, m: int, y: int) -> date | None:
    if y < 100:
        y += 2000 if y < 70 else 1900
    try:
        return date(y, m, d)
    except ValueError:
        return None


def find_dates(text: str) -> list[tuple[int, date]]:
    """Alle Datumsangaben mit Position im Text."""
    found: list[tuple[int, date]] = []
    for m in _NUM_DATE.finditer(text):
        d = _make_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if d:
            found.append((m.start(), d))
    for m in _TXT_DATE.finditer(text):
        d = _make_date(int(m.group(1)), MONTHS[m.group(2).lower()], int(m.group(3)))
        if d:
            found.append((m.start(), d))
    for m in _ISO_DATE.finditer(text):
        d = _make_date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        if d:
            found.append((m.start(), d))
    return sorted(found)


def _context_before(text: str, pos: int, width: int = 45) -> str:
    start = max(0, pos - width)
    chunk = text[start:pos]
    if "\n" in chunk:
        chunk = chunk.rsplit("\n", 1)[1]
    return chunk.lower()


def _plausible(d: date, today: date) -> bool:
    return date(1990, 1, 1) <= d <= today + timedelta(days=366 * 2)


def extract_doc_date(text: str, today: date) -> Candidate | None:
    dates = [(p, d) for p, d in find_dates(text) if _plausible(d, today)]
    if not dates:
        return None
    labelled, neutral = [], []
    for pos, d in dates:
        ctx = _context_before(text, pos)
        if any(k in ctx for k in DATE_NEGATIVE):
            continue
        (labelled if any(k in ctx for k in DATE_POSITIVE) else neutral).append((pos, d))
    if labelled:
        return Candidate(labelled[0][1].isoformat(), 0.9)
    head = len(text) * 0.5
    early = [x for x in neutral if x[0] <= head]
    if early:
        return Candidate(early[0][1].isoformat(), 0.65)
    if neutral:
        return Candidate(neutral[0][1].isoformat(), 0.45)
    return Candidate(dates[0][1].isoformat(), 0.25)


def extract_amount(text: str) -> Candidate | None:
    lines = text.splitlines()
    best: tuple[float, int, int] | None = None  # (staerke, zeile, cent)
    all_amounts: list[int] = []
    for i, raw in enumerate(lines):
        low = raw.lower()
        amounts = [parse_eur(m.group(1)) for m in _AMOUNT.finditer(raw)]
        amounts = [a for a in amounts if a is not None]
        strength = 0.0
        if any(k in low for k in STRONG_AMOUNT):
            strength = 0.9
        elif any(k in low for k in MEDIUM_AMOUNT):
            strength = 0.7
        excluded = any(k in low for k in EXCLUDE_AMOUNT) and strength < 0.9
        if strength == 0.7 and "brutto" not in low and excluded:
            strength = 0.0
        if not amounts and strength and i + 1 < len(lines):
            nxt = [parse_eur(m.group(1)) for m in _AMOUNT.finditer(lines[i + 1])]
            amounts = [a for a in nxt if a is not None]
            if amounts and any(k in lines[i + 1].lower() for k in EXCLUDE_AMOUNT):
                amounts = []
        all_amounts += [a for a in amounts if a > 0]
        if strength and amounts and not excluded:
            cand = (strength, i, max(amounts))
            if best is None or (cand[0], cand[1]) >= (best[0], best[1]):
                best = cand
    if best:
        return Candidate(best[2], best[0])
    if len(set(all_amounts)) == 1:
        return Candidate(all_amounts[0], 0.5)
    if all_amounts:
        return Candidate(max(all_amounts), 0.3)
    return None


def _clean_company(line: str) -> str:
    line = re.split(r"\s[·|•\-–]\s(?=.*\d)|\s{2,}", line)[0]
    line = re.sub(r"^(absender|von|firma)\s*[:.]?\s*", "", line, flags=re.IGNORECASE)
    line = re.sub(r"\s*,?\s*\d{5}\s.*$", "", line)
    line = re.sub(r"\s*,\s*[A-ZÄÖÜ][\w.\- ]+\s\d+[a-z]?\s*$", "", line)
    return line.strip(" ,;:-")[:80]


def extract_company(
    text: str, known: list[tuple[int, str, list[str]]]
) -> tuple[Candidate | None, int | None]:
    """Bekannte Firmen/Aliase zuerst, danach Rechtsformen und Absenderzeile."""
    lines = _clean_lines(text)
    head = norm_text(" ".join(lines[:15]))
    full = norm_text(text)
    best: tuple[int, int, int, str] | None = None
    for cid, name, aliases in known:
        for variant in [name, *aliases]:
            n = norm_text(variant)
            if len(n) < 3:
                continue
            for hay, conf_rank in ((head, 2), (full, 1)):
                if re.search(rf"(?<![a-z0-9]){re.escape(n)}(?![a-z0-9])", hay):
                    cand = (conf_rank, len(n), cid, name)
                    if best is None or cand[:2] > best[:2]:
                        best = cand
                    break
    if best:
        return Candidate(best[3], 0.95 if best[0] == 2 else 0.8), best[2]
    for ln in lines[:12]:
        if LEGAL_FORMS.search(ln) and not re.search(r"sehr geehrte|rechnung nr", ln, re.IGNORECASE):
            name = _clean_company(ln)
            if len(name) >= 3 and re.search(r"[A-Za-zÄÖÜäöü]{3}", name):
                return Candidate(name, 0.6), None
    for ln in lines[:6]:
        name = _clean_company(ln)
        if len(name) >= 3 and re.search(r"[A-Za-zÄÖÜäöü]{3}", name) and not _NUM_DATE.search(name):
            return Candidate(name, 0.3), None
    return None, None


def classify_type(text: str) -> Candidate | None:
    low = text.lower()
    head = "\n".join(low.splitlines()[:25])
    scores: dict[str, float] = {}
    for typ, rules in TYPE_RULES.items():
        s = 0.0
        for pattern, weight in rules:
            if re.search(pattern, head):
                s += weight * 2
            elif re.search(pattern, low):
                s += weight
        if s:
            scores[typ] = s
    if not scores:
        if re.search(r"sehr geehrte|mit freundlichen grüßen", low):
            return Candidate("Schreiben", 0.4)
        return None
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    top, second = ranked[0], (ranked[1][1] if len(ranked) > 1 else 0)
    conf = min(0.95, 0.45 + 0.05 * top[1] + 0.05 * (top[1] - second))
    return Candidate(top[0], round(max(0.4, conf), 2))


def classify_category(text: str) -> Candidate | None:
    low = text.lower()
    scores = {name: len(re.findall(p, low)) for name, p in CATEGORY_RULES.items()}
    scores = {k: v for k, v in scores.items() if v}
    if not scores:
        return None
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    top = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    conf = min(0.9, 0.4 + 0.1 * top[1] + 0.1 * (top[1] - second))
    return Candidate(top[0], round(conf, 2))


def extract_references(text: str) -> list[dict]:
    out, seen = [], set()
    for typ, pattern in REF_PATTERNS:
        for m in re.finditer(rf"(?:{pattern}){_REF_VALUE}", text, re.IGNORECASE):
            value = m.group(1).strip(" .,:;")
            if not re.search(r"\d", value) or len(value) < 3:
                continue
            key = re.sub(r"[^A-Z0-9]", "", value.upper())
            if (typ, key) in seen:
                continue
            seen.add((typ, key))
            out.append({"type": typ, "value": value, "confidence": 0.8})
    return out


def _duration(num: str, unit: str) -> tuple[int, str]:
    n = int(num)
    u = unit.lower()
    if u.startswith("monat"):
        return n, "months"
    if u.startswith("jahr"):
        return n * 12, "months"
    if u.startswith("woche"):
        return n * 7, "days"
    return n, "days"


def _minus(end: date, amount: int, kind: str) -> date:
    return add_months(end, -amount) if kind == "months" else end - timedelta(days=amount)


_DATE_PATTERN = (
    r"(\d{1,2}\.\s?\d{1,2}\.\s?(?:\d{4}|\d{2})|\d{1,2}\.?\s+[A-Za-zä]+\s+\d{4}|\d{4}-\d{2}-\d{2})"
)


def _first_date(s: str) -> date | None:
    ds = find_dates(s)
    return ds[0][1] if ds else None


def extract_deadlines(text: str, doc_date: date | None, today: date) -> list[dict]:
    out: list[dict] = []
    low = text.lower()

    # Zahlungsziel
    m = re.search(
        r"(?:zahlbar|zahlung|zahlen|zu zahlen|fällig(?:keit)?(?:sdatum)?|zahlungsziel|überweisen)[^\n]{0,60}?"
        r"(?:bis(?: spätestens| zum)?|am|zum|:)\s*" + _DATE_PATTERN,
        text, re.IGNORECASE,
    )  # fmt: skip
    if not m:
        m = re.search(
            r"(?:fällig(?:keit)?(?:sdatum)?|zahlungsziel)\s*:?\s*" + _DATE_PATTERN,
            text,
            re.IGNORECASE,
        )
    pay_date = _first_date(m.group(1)) if m else None
    if pay_date:
        out.append({"type": "zahlungsziel", "due_date": pay_date.isoformat(), "confidence": 0.85,
                    "note": "Im Dokument genannt"})  # fmt: skip
    elif doc_date:
        m2 = re.search(
            r"(?:innerhalb von|binnen|zahlbar innerhalb)\s+(\d{1,3})\s+(tag(?:e|en)?)", low
        )
        if m2:
            n, _ = _duration(m2.group(1), "tage")
            out.append({"type": "zahlungsziel", "due_date": (doc_date + timedelta(days=n)).isoformat(),
                        "confidence": 0.6, "note": f"{n} Tage nach Rechnungsdatum"})  # fmt: skip

    # Vertragsende und Verlaengerung
    end: date | None = None
    m = re.search(
        r"(?:vertragsende|laufzeit(?:ende)?(?:\s+bis)?|läuft\s+bis|endet\s+am|vertrag\s+endet|"
        r"befristet\s+bis|gültig\s+bis|versicherungsende|ablauf(?:datum)?)[^\n\d]{0,25}" + _DATE_PATTERN,
        text, re.IGNORECASE,
    )  # fmt: skip
    if m:
        end = _first_date(m.group(1))
    start = None
    ms = re.search(
        r"(?:vertragsbeginn|versicherungsbeginn|beginn(?: der laufzeit)?|ab dem|laufzeit ab)[^\n\d]{0,20}" + _DATE_PATTERN,
        text, re.IGNORECASE,
    )  # fmt: skip
    if ms:
        start = _first_date(ms.group(1))
    min_term = re.search(
        r"(?:mindestlaufzeit|vertragslaufzeit|laufzeit)\s*(?:von|:)?\s*(\d{1,3})\s*(monat\w*|jahr\w*)",
        low,
    )
    end_conf = 0.85
    if end is None and start and min_term:
        n, kind = _duration(min_term.group(1), min_term.group(2))
        if kind == "months":
            end, end_conf = add_months(start, n), 0.5
    repeat = 0
    mr = re.search(
        r"(?:verlängert sich|verlängerung)[^.\n]{0,60}?(?:um|jeweils um)\s*(?:jeweils\s*)?"
        r"(?:weitere\s*)?(\d{1,2}|ein(?:en)?|zwölf)\s*(monat\w*|jahr\w*)",
        low,
    )  # fmt: skip
    if mr:
        num = {"ein": "1", "einen": "1", "zwölf": "12"}.get(mr.group(1), mr.group(1))
        repeat, kind = _duration(num, mr.group(2))
        repeat = repeat if kind == "months" else 0
    elif re.search(r"verlängert sich[^.\n]{0,40}(?:jeweils )?um ein weiteres jahr", low):
        repeat = 12
    if end and _plausible(end, today):
        out.append({"type": "vertragsende", "due_date": end.isoformat(), "confidence": end_conf,
                    "repeat_months": repeat, "note": "Vertragsende laut Dokument"})  # fmt: skip

    # Kuendigungsfrist
    explicit = re.search(
        r"(?:kündbar|kündigung)[^\n]{0,40}?bis(?: spätestens| zum)?\s*" + _DATE_PATTERN,
        text,
        re.IGNORECASE,
    )
    notice = re.search(
        r"kündigungsfrist[^\n\d]{0,25}(\d{1,3})\s*(monat\w*|woche\w*|tag\w*|jahr\w*)|"
        r"(\d{1,3})\s*(monat\w*|woche\w*|tag\w*)[^\n]{0,30}(?:vor (?:ablauf|ende|vertragsende)|zum (?:ende|ablauf))",
        low,
    )  # fmt: skip
    cancel_date: date | None = None
    cancel_conf, cancel_note = 0.0, ""
    if explicit:
        cancel_date = _first_date(explicit.group(1))
        cancel_conf, cancel_note = 0.8, "Im Dokument genannt"
    elif notice and end:
        num = notice.group(1) or notice.group(3)
        unit = notice.group(2) or notice.group(4)
        n, kind = _duration(num, unit)
        cancel_date = _minus(end, n, kind)
        cancel_conf = 0.6
        cancel_note = f"Vertragsende minus Kündigungsfrist ({num} {unit})"
    if cancel_date and _plausible(cancel_date, today):
        out.append({"type": "kuendigungsfrist", "due_date": cancel_date.isoformat(),
                    "confidence": cancel_conf, "repeat_months": repeat, "note": cancel_note})  # fmt: skip
    return out


def extract(
    text: str,
    *,
    known_companies: list[tuple[int, str, list[str]]] | None = None,
    today: date | None = None,
) -> Extraction:
    today = today or date.today()
    ex = Extraction()
    company, company_id = extract_company(text, known_companies or [])
    if company:
        ex.fields["firma"] = company
        ex.company_id = company_id
    if (c := extract_doc_date(text, today)) is not None:
        ex.fields["datum"] = c
    if (c := extract_amount(text)) is not None:
        ex.fields["betrag"] = c
    if (c := classify_type(text)) is not None:
        ex.fields["art"] = c
    if (c := classify_category(text)) is not None:
        ex.fields["bereich"] = c
    doc_date = date.fromisoformat(ex.fields["datum"].value) if "datum" in ex.fields else None
    ex.deadlines = extract_deadlines(text, doc_date, today)
    ex.references = extract_references(text)
    return ex

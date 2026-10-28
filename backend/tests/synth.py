"""Synthetische deutsche Testdokumente (Pillow) fuer OCR-/Extraktionstests und das Gold-Set.

Keine echten Daten. Jedes Dokument liefert den Text und die erwarteten Werte.
"""

from __future__ import annotations

import io
import random
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/Library/Fonts/Arial.ttf",
]


@dataclass
class Doc:
    name: str
    lines: list[str]
    expect: dict = field(default_factory=dict)  # firma, datum, betrag (Cent), art, bereich
    deadlines: dict = field(default_factory=dict)  # typ -> ISO-Datum
    references: dict = field(default_factory=dict)  # typ -> Wert


DOCS: list[Doc] = [
    Doc(
        "vodafone-rechnung",
        [
            "Vodafone GmbH · Ferdinand-Braun-Platz 1 · 40549 Düsseldorf",
            "",
            "Frau Erika Mustermann",
            "Beispielweg 12",
            "50667 Köln",
            "",
            "Rechnung",
            "Rechnungsnummer: 2024-118233",
            "Kundennummer: 1234567890",
            "Rechnungsdatum: 12.03.2024",
            "",
            "Mobilfunk Tarif Red M, März 2024          41,97 €",
            "Nettobetrag                                41,97 €",
            "Umsatzsteuer 19 %                           7,97 €",
            "Gesamtbetrag                               49,94 €",
            "",
            "Bitte überweisen Sie den Betrag zahlbar bis 26.03.2024.",
        ],
        {
            "firma": "Vodafone GmbH",
            "datum": "2024-03-12",
            "betrag": 4994,
            "art": "Rechnung",
            "bereich": "Telefon & Internet",
        },
        {"zahlungsziel": "2024-03-26"},
        {"rechnungsnummer": "2024-118233", "kundennummer": "1234567890"},
    ),
    Doc(
        "allianz-police",
        [
            "Allianz Versicherungs-AG",
            "80790 München",
            "",
            "München, den 15.12.2022",
            "",
            "Versicherungsschein",
            "Hausratversicherung",
            "Versicherungsschein-Nr. AB-123456789",
            "Versicherungsbeginn: 01.01.2023",
            "Vertragsende: 01.01.2025",
            "Jahresbeitrag                              312,40 €",
            "Der Vertrag verlängert sich jeweils um ein weiteres Jahr, wenn er nicht",
            "gekündigt wird. Kündigungsfrist: 3 Monate zum Ende der Laufzeit.",
        ],
        {
            "firma": "Allianz Versicherungs-AG",
            "datum": "2022-12-15",
            "betrag": 31240,
            "art": "Versicherungsschein",
            "bereich": "Versicherung",
        },
        {"vertragsende": "2025-01-01", "kuendigungsfrist": "2024-10-01"},
        {"vertragsnummer": "AB-123456789"},
    ),
    Doc(
        "stadtwerke-mahnung",
        [
            "Stadtwerke München GmbH",
            "Emmy-Noether-Straße 2",
            "",
            "Datum: 02.05.2024",
            "",
            "Mahnung",
            "Rechnungsnummer: R-2024-77123",
            "Kundennummer: 99887766",
            "Zu unserer Rechnung für Strom und Gas ist keine Zahlung eingegangen.",
            "Offener Betrag                             87,15 €",
            "Mahngebühr                                  5,00 €",
            "Bitte zahlen Sie bis zum 10.05.2024.",
        ],
        {
            "firma": "Stadtwerke München GmbH",
            "datum": "2024-05-02",
            "betrag": 8715,
            "art": "Mahnung",
            "bereich": "Strom & Gas",
        },
        {"zahlungsziel": "2024-05-10"},
        {"rechnungsnummer": "R-2024-77123", "kundennummer": "99887766"},
    ),
    Doc(
        "finanzamt-bescheid",
        [
            "Finanzamt Köln-Mitte",
            "50667 Köln",
            "",
            "Köln, den 21.08.2023",
            "",
            "Einkommensteuerbescheid 2022",
            "Steuernummer 214/5678/9012",
            "Aktenzeichen: ESt-2022-004711",
            "Festgesetzte Steuer                       2.345,67 €",
            "Zahlbar bis 25.09.2023",
            "Gegen diesen Bescheid kann Einspruch eingelegt werden.",
        ],
        {
            "firma": "Finanzamt Köln-Mitte",
            "datum": "2023-08-21",
            "betrag": 234567,
            "art": "Bescheid",
            "bereich": "Steuern & Behörden",
        },
        {"zahlungsziel": "2023-09-25"},
        {"aktenzeichen": "ESt-2022-004711"},
    ),
    Doc(
        "mediamarkt-bon",
        [
            "MediaMarkt Saturn Retail Group GmbH",
            "Kassenbon",
            "05.06.2023  14:32",
            "Notebook ProBook 15                       799,00",
            "Summe                                     799,00",
            "Zahlart: Karte",
            "Vielen Dank für Ihren Einkauf",
        ],
        {
            "firma": "MediaMarkt Saturn Retail Group GmbH",
            "datum": "2023-06-05",
            "betrag": 79900,
            "art": "Kaufbeleg",
            "bereich": "Elektronik",
        },
    ),
    Doc(
        "telekom-kuendigungsbestaetigung",
        [
            "Telekom Deutschland GmbH",
            "53227 Bonn",
            "",
            "Bonn, den 03.11.2023",
            "",
            "Kündigungsbestätigung",
            "Kundennummer: 4455667788",
            "Vertragsnummer: DSL-2021-5566",
            "hiermit bestätigen wir Ihnen die Kündigung Ihres Internetvertrags.",
            "Der Vertrag endet am 31.01.2024.",
        ],
        {
            "firma": "Telekom Deutschland GmbH",
            "datum": "2023-11-03",
            "art": "Kündigungsbestätigung",
            "bereich": "Telefon & Internet",
        },
        {"vertragsende": "2024-01-31"},
        {"kundennummer": "4455667788", "vertragsnummer": "DSL-2021-5566"},
    ),
    Doc(
        "sanitaer-rechnung",
        [
            "Sanitär Müller GmbH",
            "Handwerkerstraße 5, 80331 München",
            "",
            "Rechnung Nr. 2023-0456",
            "7. Juli 2023",
            "Reparatur Wasserleitung, Arbeitszeit und Material",
            "Zwischensumme                            1.037,41 €",
            "MwSt 19 %                                  197,11 €",
            "Rechnungsbetrag                          1.234,52 €",
            "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
        ],
        {
            "firma": "Sanitär Müller GmbH",
            "datum": "2023-07-07",
            "betrag": 123452,
            "art": "Rechnung",
            "bereich": "Handwerker",
        },
        {"zahlungsziel": "2023-07-21"},
        {"rechnungsnummer": "2023-0456"},
    ),
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise RuntimeError("Keine TrueType-Schrift gefunden")


def render(doc: Doc, *, noise: bool = False, rotate: float = 0.0, size=(1654, 2339)) -> Image.Image:
    """A4 bei ca. 200 dpi."""
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    font = _font(34)
    y = 140
    for line in doc.lines:
        d.text((130, y), line, fill="black", font=font)
        y += 58
    if noise:
        rnd = random.Random(7)
        px = img.load()
        for _ in range(size[0] * size[1] // 80):
            x, yy = rnd.randrange(size[0]), rnd.randrange(size[1])
            g = rnd.randrange(150, 255)
            px[x, yy] = (g, g, g)
        img = img.filter(ImageFilter.GaussianBlur(0.8))
    if rotate:
        img = img.rotate(rotate, expand=True, fillcolor="white")
    return img


def to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt, **({"quality": 85} if fmt == "JPEG" else {}))
    return buf.getvalue()


def to_pdf_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PDF", resolution=200)
    return buf.getvalue()

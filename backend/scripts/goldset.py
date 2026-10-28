"""Gold-Set-Auswertung: Erkennungsrate der Extraktion an synthetischen Dokumenten.

Nutzung: python scripts/goldset.py [--noise]
Misst Firma, Datum, Betrag, Art, Bereich und Fristen. Echte Dokumente des Nutzers gehoeren
bewusst nicht ins Repository (Datenschutz).
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from synth import DOCS, render  # noqa: E402

from syd.extract import ocr, rules  # noqa: E402

TODAY = date(2024, 6, 1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--noise", action="store_true", help="Rauschen, Unschaerfe und leichte Drehung")
    args = ap.parse_args()
    total: dict[str, list[int]] = {}
    for doc in DOCS:
        img = render(doc, noise=args.noise, rotate=1.0 if args.noise else 0.0)
        page = ocr.ocr_image(img)
        ex = rules.extract(page.text, today=TODAY)
        got = {k: v.value for k, v in ex.fields.items()}
        res = []
        for field, want in doc.expect.items():
            ok = got.get(field) == want
            total.setdefault(field, []).append(int(ok))
            res.append(f"{field}={'ok' if ok else 'FALSCH ' + repr(got.get(field))}")
        dl = {d["type"]: d["due_date"] for d in ex.deadlines}
        for typ, want in doc.deadlines.items():
            ok = dl.get(typ) == want
            total.setdefault("frist", []).append(int(ok))
            res.append(f"{typ}={'ok' if ok else 'FALSCH ' + repr(dl.get(typ))}")
        print(f"{doc.name:34} OCR {page.confidence:.0%}  " + "  ".join(res))
    print()
    for field, vals in total.items():
        print(f"{field:10} {sum(vals)}/{len(vals)}  ({sum(vals) / len(vals):.0%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

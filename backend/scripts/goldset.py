"""Gold-Set-Auswertung: Erkennungsrate der Extraktion an synthetischen Dokumenten.

Nutzung: python scripts/goldset.py [--noise | --photo | --hard] [--only NAME] [--show-text]
  (ohne Schalter) saubere Scans, --noise Rauschen/Unschaerfe/1 Grad Drehung,
  --photo Handy-Foto (Perspektive, Schatten, JPEG, bis 5 Grad), --hard haerter inkl. 90/180 Grad.
Misst Firma, Datum, Betrag, Art, Bereich, Fristen und Referenznummern je Feld und je Dokumentart.
Echte Dokumente des Nutzers gehoeren bewusst nicht ins Repository (Datenschutz).
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from synth import DOCS, degrade, render  # noqa: E402
from synth_extra import EXTRA_DOCS  # noqa: E402

from syd.extract import ocr, rules  # noqa: E402

TODAY = date(2024, 6, 1)


def _rate(vals: list[int]) -> str:
    return f"{sum(vals)}/{len(vals)}  ({sum(vals) / len(vals):.0%})"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--noise", action="store_true", help="Rauschen, Unschaerfe und leichte Drehung")
    ap.add_argument("--photo", action="store_true", help="Handy-Foto-Degradation")
    ap.add_argument(
        "--hard", action="store_true", help="Haerter, inkl. 90/180 Grad gedrehter Seiten"
    )
    ap.add_argument("--only", help="Nur Dokumente, deren Name diesen Text enthaelt")
    ap.add_argument("--show-text", action="store_true", help="OCR-Text bei Fehlern ausgeben")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    level = "hard" if args.hard else "photo" if args.photo else None
    by_field: dict[str, list[int]] = {}
    by_type: dict[str, list[int]] = {}
    everything: list[int] = []
    seconds = 0.0
    docs = [d for d in DOCS + EXTRA_DOCS if not args.only or args.only in d.name]
    for i, doc in enumerate(docs):
        img = render(doc, noise=args.noise, rotate=1.0 if args.noise else 0.0)
        if level:
            img = degrade(img, i, level)
        t0 = time.perf_counter()
        page = ocr.ocr_image(img)
        seconds += time.perf_counter() - t0
        ex = rules.extract(page.text, today=TODAY)
        got = {k: v.value for k, v in ex.fields.items()}
        dl = {d["type"]: d["due_date"] for d in ex.deadlines}
        refs = {r["type"]: r["value"] for r in ex.references}
        checks: list[tuple[str, str, object, object]] = []
        checks += [(f, f, want, got.get(f)) for f, want in doc.expect.items()]
        checks += [("frist", t, want, dl.get(t)) for t, want in doc.deadlines.items()]
        checks += [("referenz", t, want, refs.get(t)) for t, want in doc.references.items()]
        res = []
        for group, name, want, have in checks:
            ok = have == want
            by_field.setdefault(group, []).append(int(ok))
            by_type.setdefault(str(doc.expect.get("art", "?")), []).append(int(ok))
            everything.append(int(ok))
            res.append(f"{name}={'ok' if ok else 'FALSCH ' + repr(have)}")
        print(f"{doc.name:32} OCR {page.confidence:.0%}  " + "  ".join(res))
        if args.show_text and any("FALSCH" in r for r in res):
            print("    " + page.text.replace("\n", "\n    "))
    print("\nJe Feld:")
    for field, vals in by_field.items():
        print(f"  {field:10} {_rate(vals)}")
    print("Je Dokumentart:")
    for typ, vals in sorted(by_type.items()):
        print(f"  {typ:22} {_rate(vals)}")
    print(f"GESAMT {_rate(everything)}   OCR-Zeit {seconds / len(docs):.1f} s je Seite")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

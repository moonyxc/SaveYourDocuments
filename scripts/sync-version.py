"""Überträgt die Version aus version.txt in alle Projektdateien.

Aufruf (im Projektordner):
    python scripts/sync-version.py            schreibt die Version überall hin
    python scripts/sync-version.py --check    prüft nur und meldet Abweichungen (Exitcode 1)

Nur die Standardbibliothek, damit es überall ohne Installation läuft.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def read_version() -> str:
    version = (ROOT / "version.txt").read_text("utf-8").strip()
    if not SEMVER.match(version):
        raise SystemExit(
            f"FEHLER: version.txt enthält '{version}'. Erwartet wird z. B. 1.2.3 (nur Zahlen mit Punkten)."
        )
    return version


# (Datei, Muster mit genau einer Gruppe für die alte Version). Es wird jeweils nur die erste
# Fundstelle ersetzt; der Kontext davor verhindert Fehltreffer bei anderen "version"-Zeilen.
TARGETS: list[tuple[str, str]] = [
    ("backend/syd/__init__.py", r'(?m)^__version__ = "([^"]+)"'),
    ("backend/pyproject.toml", r'(?ms)^\[project\].*?^version = "([^"]+)"'),
    ("src-tauri/Cargo.toml", r'(?ms)^\[package\].*?^version = "([^"]+)"'),
    ("src-tauri/Cargo.lock", r'(?ms)^name = "save-your-documents"\r?\nversion = "([^"]+)"'),
    ("src-tauri/tauri.conf.json", r'(?m)^\s*"version":\s*"([^"]+)"'),
    ("frontend/package.json", r'(?m)^\s*"version":\s*"([^"]+)"'),
    ("frontend/package-lock.json", r'(?ms)^\{.*?"version":\s*"([^"]+)"'),
    (
        "frontend/package-lock.json",
        r'(?ms)^\s*"packages":\s*\{\s*"":\s*\{.*?"version":\s*"([^"]+)"',
    ),
]


def replace_group(text: str, pattern: str, new: str) -> tuple[str, str | None]:
    m = re.search(pattern, text)
    if not m:
        return text, None
    start, end = m.span(1)
    return text[:start] + new + text[end:], m.group(1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--check", action="store_true", help="nur prüfen, nichts ändern")
    args = ap.parse_args()
    version = read_version()

    problems: list[str] = []
    changed: list[str] = []
    for rel, pattern in TARGETS:
        path = ROOT / rel
        if not path.exists():
            problems.append(f"{rel}: Datei fehlt")
            continue
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        new_text, old = replace_group(text, pattern, version)
        if old is None:
            problems.append(f"{rel}: Versionszeile nicht gefunden")
            continue
        if old != version:
            changed.append(f"{rel}: {old} -> {version}")
            if not args.check:
                path.write_bytes(new_text.encode("utf-8"))  # Datei wird je Muster frisch gelesen

    if problems:
        print("FEHLER:\n  " + "\n  ".join(problems))
        return 1
    if changed:
        label = "Weicht ab" if args.check else "Aktualisiert"
        print(f"{label} (Version {version}):\n  " + "\n  ".join(changed))
        return 1 if args.check else 0
    print(f"OK: überall Version {version}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

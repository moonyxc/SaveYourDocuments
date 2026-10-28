"""Optionaler lokaler Ollama-Provider (nur Loopback, nur zur Verbesserung unsicherer Felder)."""

from __future__ import annotations

import ipaddress
import json
import re
from urllib.parse import urlparse

import httpx

from ..util import parse_eur, valid_iso_date

FIELDS_TO_IMPROVE = ("firma", "datum", "betrag", "art")


def ensure_local_url(url: str) -> str:
    from ..repo import ArchiveError

    p = urlparse(url)
    host = p.hostname or ""
    ok = host == "localhost"
    try:
        ok = ok or ipaddress.ip_address(host).is_loopback
    except ValueError:
        pass
    if p.scheme not in ("http", "https") or not ok:
        raise ArchiveError(
            "Ollama muss auf diesem Computer laufen (Adresse 127.0.0.1 oder localhost).",
            "ungueltig",
        )
    return url.rstrip("/")


def status(url: str, timeout: float = 2.0) -> dict:
    try:
        base = ensure_local_url(url)
        r = httpx.get(f"{base}/api/tags", timeout=timeout)
        r.raise_for_status()
        return {"reachable": True, "models": [m["name"] for m in r.json().get("models", [])]}
    except Exception:
        return {"reachable": False, "models": []}


def refine(text: str, url: str, model: str, types: list[str], timeout: float = 90.0) -> dict:
    """Gibt validierte Felder zurueck: firma, datum, betrag (Cent), art."""
    base = ensure_local_url(url)
    prompt = (
        "Du liest den Text eines deutschen Dokuments. Antworte ausschließlich als JSON mit den "
        'Schlüsseln "firma" (Absender), "datum" (Dokumentdatum als JJJJ-MM-TT), "betrag" '
        '(Gesamtbetrag als Zahl mit Komma, z. B. "49,99") und "art" (eine aus: '
        f"{', '.join(types)}). Unbekannte Werte als null.\n\nText:\n{text[:6000]}"
    )
    r = httpx.post(
        f"{base}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False, "format": "json",
              "options": {"temperature": 0}},
        timeout=timeout,
    )  # fmt: skip
    r.raise_for_status()
    try:
        raw = json.loads(r.json().get("response", "{}"))
    except json.JSONDecodeError:
        return {}
    out: dict = {}
    if isinstance(raw.get("firma"), str) and 2 <= len(raw["firma"].strip()) <= 80:
        out["firma"] = raw["firma"].strip()
    if isinstance(raw.get("datum"), str) and valid_iso_date(raw["datum"]):
        out["datum"] = raw["datum"]
    betrag = raw.get("betrag")
    if isinstance(betrag, str | int | float):
        cents = parse_eur(
            betrag if not isinstance(betrag, str) else re.sub(r"[^\d,.\-]", "", betrag)
        )
        if cents is not None:
            out["betrag"] = cents
    if raw.get("art") in types:
        out["art"] = raw["art"]
    return out

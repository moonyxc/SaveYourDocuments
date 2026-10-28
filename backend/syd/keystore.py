"""Schluesselablage: an das Windows-Konto gebunden (DPAPI), sonst Dateirechte als Notbehelf."""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path


class KeyStoreError(Exception):
    pass


def _dpapi(data: bytes, protect: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(data, len(data))
    inp = Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out = Blob()
    fn = (
        ctypes.windll.crypt32.CryptProtectData
        if protect
        else ctypes.windll.crypt32.CryptUnprotectData
    )
    entropy = b"SaveYourDocuments.v1"
    ebuf = ctypes.create_string_buffer(entropy, len(entropy))
    eblob = Blob(len(entropy), ctypes.cast(ebuf, ctypes.POINTER(ctypes.c_char)))
    ok = fn(ctypes.byref(inp), None, ctypes.byref(eblob), None, None, 0, ctypes.byref(out))
    if not ok:
        raise KeyStoreError("Der Schlüssel konnte mit diesem Windows-Konto nicht geöffnet werden.")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def method() -> str:
    return "dpapi" if sys.platform == "win32" else "file"


def store_key(path: Path, key: bytes) -> None:
    m = method()
    blob = _dpapi(key, True) if m == "dpapi" else key
    payload = {"v": 1, "method": m, "data": base64.b64encode(blob).decode()}
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    os.replace(tmp, path)
    if m == "file":
        os.chmod(path, 0o600)


def load_key(path: Path) -> bytes:
    if not path.exists():
        raise KeyStoreError("Es ist kein gespeicherter Schlüssel vorhanden.")
    try:
        payload = json.loads(path.read_text("utf-8"))
        blob = base64.b64decode(payload["data"])
        m = payload["method"]
    except (OSError, ValueError, KeyError) as exc:
        raise KeyStoreError("Die Schlüsseldatei ist beschädigt.") from exc
    if m == "dpapi":
        if sys.platform != "win32":
            raise KeyStoreError("Der Schlüssel gehört zu einem anderen Windows-Konto.")
        key = _dpapi(blob, False)
    else:
        key = blob
    if len(key) != 32:
        raise KeyStoreError("Die Schlüsseldatei ist beschädigt.")
    return key


def delete_key(path: Path) -> None:
    path.unlink(missing_ok=True)

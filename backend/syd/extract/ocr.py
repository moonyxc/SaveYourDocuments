"""Lokale Texterkennung: Tesseract per Subprozess, PDF-Rendering ueber pypdfium2."""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

MAX_SIDE = 3600  # laengste Kante fuer OCR in Pixeln
OCR_TIMEOUT = 180
MAX_PAGES = 60


class OcrUnavailableError(RuntimeError):
    """Tesseract oder die deutschen Sprachdaten fehlen."""


class UnreadableFileError(RuntimeError):
    """Datei konnte nicht als Bild oder PDF geoeffnet werden."""


@dataclass
class PageText:
    text: str
    confidence: float  # 0..1
    from_text_layer: bool = False


def _bundled_dir() -> Path | None:
    base = getattr(sys, "_MEIPASS", None)
    return Path(base) / "tesseract" if base else None


def find_tesseract() -> str:
    env = os.environ.get("SYD_TESSERACT")
    if env and Path(env).exists():
        return env
    bundled = _bundled_dir()
    if bundled:
        for name in ("tesseract.exe", "tesseract"):
            if (bundled / name).exists():
                return str(bundled / name)
    found = shutil.which("tesseract")
    if found:
        return found
    raise OcrUnavailableError("Tesseract wurde nicht gefunden. Bitte die Installation reparieren.")


def _env() -> dict[str, str]:
    env = dict(os.environ)
    tessdata = os.environ.get("SYD_TESSDATA")
    bundled = _bundled_dir()
    if not tessdata and bundled and (bundled / "tessdata").exists():
        tessdata = str(bundled / "tessdata")
    if tessdata:
        env["TESSDATA_PREFIX"] = tessdata
    env["OMP_THREAD_LIMIT"] = "1"
    return env


def available_languages() -> list[str]:
    try:
        out = subprocess.run(
            [find_tesseract(), "--list-langs"],
            capture_output=True,
            text=True,
            timeout=30,
            env=_env(),
        ).stdout
    except (OSError, subprocess.SubprocessError, OcrUnavailableError):
        return []
    return [ln.strip() for ln in out.splitlines()[1:] if ln.strip()]


def status() -> dict:
    langs = available_languages()
    return {"available": "deu" in langs, "languages": langs}


def _pick_lang() -> str:
    langs = available_languages()
    if "deu" in langs:
        return "deu+eng" if "eng" in langs else "deu"
    raise OcrUnavailableError("Die deutschen Sprachdaten für die Texterkennung fehlen.")


def _register_heif() -> None:
    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
    except ImportError:  # HEIC ist optional
        pass


def iter_pages(data: bytes, mime: str) -> Iterator[Image.Image]:
    """Seiten nacheinander als RGB-Bilder (EXIF-Drehung angewandt), schont den Speicher."""
    if mime == "application/pdf":
        yield from _iter_pdf(data)
        return
    _register_heif()
    try:
        img = Image.open(io.BytesIO(data))
        count = min(getattr(img, "n_frames", 1), MAX_PAGES)
    except Exception as exc:
        raise UnreadableFileError("Die Datei konnte nicht als Bild gelesen werden.") from exc
    for i in range(count):
        try:
            img.seek(i)
            frame = ImageOps.exif_transpose(img.copy()).convert("RGB")
        except Exception as exc:
            raise UnreadableFileError("Die Datei konnte nicht als Bild gelesen werden.") from exc
        yield frame


def _iter_pdf(data: bytes) -> Iterator[Image.Image]:
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as exc:
        raise UnreadableFileError("Das PDF ist beschädigt oder passwortgeschützt.") from exc
    try:
        for i in range(min(len(pdf), MAX_PAGES)):
            page = pdf[i]
            w, h = page.get_size()
            scale = min(300 / 72, MAX_SIDE / max(w, h))
            yield page.render(scale=scale).to_pil().convert("RGB")
    finally:
        pdf.close()


def pdf_text_layers(data: bytes) -> list[str]:
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except Exception:
        return []
    try:
        return [pdf[i].get_textpage().get_text_range() for i in range(min(len(pdf), MAX_PAGES))]
    except Exception:
        return []
    finally:
        pdf.close()


def preprocess(img: Image.Image) -> Image.Image:
    g = ImageOps.grayscale(img)
    g = ImageOps.autocontrast(g, cutoff=1)
    longest = max(g.size)
    if longest > MAX_SIDE:
        f = MAX_SIDE / longest
        g = g.resize((round(g.width * f), round(g.height * f)), Image.LANCZOS)
    elif longest < 1600:
        f = 1800 / longest
        g = g.resize((round(g.width * f), round(g.height * f)), Image.LANCZOS)
    return g


def _detect_rotation(png: bytes, lang_env: dict) -> int:
    try:
        out = subprocess.run(
            [find_tesseract(), "stdin", "stdout", "--psm", "0", "-l", "osd"],
            input=png, capture_output=True, timeout=60, env=lang_env,
        ).stdout.decode("utf-8", "replace")  # fmt: skip
    except (OSError, subprocess.SubprocessError):
        return 0
    rot, conf = 0, 0.0
    for ln in out.splitlines():
        if ln.startswith("Rotate:"):
            rot = int(ln.split(":")[1])
        elif ln.startswith("Orientation confidence:"):
            conf = float(ln.split(":")[1])
    return rot if conf >= 2.0 and rot in (90, 180, 270) else 0


def _to_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def ocr_image(img: Image.Image, lang: str | None = None) -> PageText:
    lang = lang or _pick_lang()
    env = _env()
    g = preprocess(img)
    png = _to_png(g)
    rot = _detect_rotation(png, env)
    if rot:
        g = g.rotate(-rot, expand=True)
        png = _to_png(g)
    try:
        res = subprocess.run(
            [find_tesseract(), "stdin", "stdout", "-l", lang, "--psm", "3", "tsv"],
            input=png, capture_output=True, timeout=OCR_TIMEOUT, env=env,
        )  # fmt: skip
    except subprocess.TimeoutExpired as exc:
        raise OcrUnavailableError("Die Texterkennung hat zu lange gedauert.") from exc
    if res.returncode != 0:
        raise OcrUnavailableError("Die Texterkennung ist fehlgeschlagen.")
    return parse_tsv(res.stdout.decode("utf-8", "replace"))


def parse_tsv(tsv: str) -> PageText:
    lines: dict[tuple[int, int, int], list[str]] = {}
    confs: list[float] = []
    for row in tsv.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or cols[0] != "5":
            continue
        word = cols[11].strip()
        if not word:
            continue
        try:
            conf = float(cols[10])
        except ValueError:
            continue
        key = (int(cols[2]), int(cols[3]), int(cols[4]))
        lines.setdefault(key, []).append(word)
        if conf >= 0:
            confs.append(conf)
    text = "\n".join(" ".join(ws) for _, ws in sorted(lines.items()))
    return PageText(text=text, confidence=(sum(confs) / len(confs) / 100) if confs else 0.0)


def recognise(data: bytes, mime: str, lang: str | None = None) -> list[PageText]:
    """OCR ueber alle Seiten. PDFs mit Textebene nutzen diese direkt."""
    if mime == "application/pdf":
        layers = pdf_text_layers(data)
        if layers and all(len(t.strip()) >= 40 for t in layers):
            return [PageText(t, 1.0, True) for t in layers]
    return [ocr_image(img, lang) for img in iter_pages(data, mime)]


def thumbnail(img: Image.Image, size: int = 360) -> bytes:
    t = img.copy()
    t.thumbnail((size, size * 2))
    buf = io.BytesIO()
    t.convert("RGB").save(buf, "JPEG", quality=78)
    return buf.getvalue()

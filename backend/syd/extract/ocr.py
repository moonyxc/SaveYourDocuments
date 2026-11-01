"""Lokale Texterkennung: Tesseract per Subprozess, PDF-Rendering ueber pypdfium2."""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat

MAX_SIDE = 3600  # laengste Kante fuer OCR in Pixeln
MIN_SIDE = 2300  # darunter wird auf TARGET_SIDE hochskaliert (ca. 220 dpi bei A4)
TARGET_SIDE = 2500
OCR_TIMEOUT = 180
MAX_PAGES = 60
GOOD_CONFIDENCE = 0.88  # darueber genuegt der erste Durchlauf
RETRY_BUDGET = 40.0  # Sekunden fuer zusaetzliche Durchlaeufe je Seite


class OcrUnavailableError(RuntimeError):
    """Tesseract oder die deutschen Sprachdaten fehlen."""


class UnreadableFileError(RuntimeError):
    """Datei konnte nicht als Bild oder PDF geoeffnet werden."""


@dataclass
class PageText:
    text: str
    confidence: float  # 0..1
    from_text_layer: bool = False
    score: float = 0.0  # Anzahl sicher erkannter Woerter (zum Vergleichen von Durchlaeufen)


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


def _crop_page(g: Image.Image) -> Image.Image:
    """Dunklen Rand um das Blatt (Tisch, Hintergrund bei Handyfotos) abschneiden."""
    small = g.copy()
    small.thumbnail((400, 400))
    w, h = small.size
    mx, my = max(2, w // 30), max(2, h // 30)
    centre = ImageStat.Stat(small.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))).mean[0]
    edge = (
        ImageStat.Stat(small.crop((0, 0, w, my))).mean[0] + ImageStat.Stat(small.crop((0, 0, mx, h))).mean[0]
        + ImageStat.Stat(small.crop((0, h - my, w, h))).mean[0] + ImageStat.Stat(small.crop((w - mx, 0, w, h))).mean[0]
    ) / 4  # fmt: skip
    if edge > centre * 0.7:
        return g
    t = _otsu(small)
    box = small.point(lambda v: 255 if v > t else 0).filter(ImageFilter.MedianFilter(5)).getbbox()
    if not box:
        return g
    bw, bh = box[2] - box[0], box[3] - box[1]
    if bw * bh < 0.4 * w * h or bw * bh > 0.98 * w * h:
        return g
    f = g.width / w
    ix, iy = bw * 0.015, bh * 0.015
    return g.crop(
        (
            round((box[0] + ix) * f),
            round((box[1] + iy) * f),
            round((box[2] - ix) * f),
            round((box[3] - iy) * f),
        )
    )


def preprocess(img: Image.Image) -> Image.Image:
    """Graustufen, Blatt freistellen, Skalierung (ca. 220 dpi), Schatten entfernen, Kontrast."""
    g = _crop_page(ImageOps.grayscale(img))
    longest = max(g.size)
    if longest > MAX_SIDE:
        f = MAX_SIDE / longest
        g = g.resize((round(g.width * f), round(g.height * f)), Image.LANCZOS)
    elif longest < MIN_SIDE:
        f = min(TARGET_SIDE / longest, 2.5)
        g = g.resize((round(g.width * f), round(g.height * f)), Image.LANCZOS)
    g = _flatten_background(g)
    # kein Abschneiden von Extremwerten: auf fast leeren Seiten (Bons) wuerde das Rauschen verstaerkt
    return ImageOps.autocontrast(g, cutoff=0)


def _flatten_background(g: Image.Image) -> Image.Image:
    """Schatten und Helligkeitsverlaeufe herausrechnen (Hintergrund ueber Maximum-Filter schaetzen)."""
    small = g.reduce(8)
    bg = small.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3))
    bg = bg.resize(g.size, Image.BILINEAR)
    return ImageChops.add(g, ImageChops.invert(bg))


def _skew_angle(g: Image.Image) -> float:
    """Schraglage in Grad (-6..6) ueber das Zeilenprofil: gerade Zeilen = starke Zeilenkontraste."""
    small = g.copy()
    small.thumbnail((700, 1000))
    bw = small.point(lambda v: 255 if v < 128 else 0)

    def score(angle: float) -> float:
        rows = list(
            bw.rotate(angle, resample=Image.BILINEAR).resize((1, bw.height), Image.BOX).getdata()
        )
        mean = sum(rows) / len(rows)
        return sum((v - mean) ** 2 for v in rows)

    coarse = max((a * 1.0 for a in range(-6, 7)), key=score)
    fine = max((coarse + d * 0.25 for d in range(-4, 5)), key=score)
    return fine if abs(fine) >= 0.3 and score(fine) > score(0) * 1.03 else 0.0


def deskew(g: Image.Image) -> Image.Image:
    angle = _skew_angle(g)
    if not angle:
        return g
    return g.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=255)


def _otsu(g: Image.Image) -> int:
    hist = g.histogram()
    total = sum(hist)
    sum_all = sum(i * h for i, h in enumerate(hist))
    best, best_t, w0, s0 = -1.0, 128, 0, 0.0
    for t in range(256):
        w0 += hist[t]
        if not w0 or w0 == total:
            continue
        s0 += t * hist[t]
        m0, m1 = s0 / w0, (sum_all - s0) / (total - w0)
        var = w0 * (total - w0) * (m0 - m1) ** 2
        if var > best:
            best, best_t = var, t
    return best_t


def _variant(g: Image.Image, kind: str) -> Image.Image:
    if kind == "sharp":
        return g.filter(ImageFilter.UnsharpMask(radius=2, percent=160, threshold=2))
    t = _otsu(g)
    return g.point(lambda v: 255 if v > t else 0)


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


def _tesseract(g: Image.Image, lang: str, psm: int, env: dict) -> PageText:
    try:
        res = subprocess.run(
            [find_tesseract(), "stdin", "stdout", "-l", lang, "--psm", str(psm), "tsv"],
            input=_to_png(g), capture_output=True, timeout=OCR_TIMEOUT, env=env,
        )  # fmt: skip
    except subprocess.TimeoutExpired as exc:
        raise OcrUnavailableError("Die Texterkennung hat zu lange gedauert.") from exc
    if res.returncode != 0:
        raise OcrUnavailableError("Die Texterkennung ist fehlgeschlagen.")
    return parse_tsv(res.stdout.decode("utf-8", "replace"))


def _rotated(g: Image.Image, rot: int) -> Image.Image:
    return g.rotate(-rot, expand=True, fillcolor=255) if rot else g


def _best_rotation(g: Image.Image, lang: str, env: dict, pool: ThreadPoolExecutor) -> int:
    """Probiert 0/90/180/270 Grad verkleinert durch; waehlt die Ausrichtung mit den meisten Woertern."""
    small = g.copy()
    small.thumbnail((1500, 1500))
    rots = (0, 90, 180, 270)
    scores = list(pool.map(lambda r: _tesseract(_rotated(small, r), lang, 3, env).score, rots))
    best = max(range(4), key=lambda i: scores[i])
    # Nur drehen, wenn die Drehung klar besser ist als die aufrechte Seite
    return rots[best] if best and scores[best] > max(scores[0] * 1.5, 8) else 0


def ocr_image(img: Image.Image, lang: str | None = None) -> PageText:
    """OCR einer Seite. Ein Durchlauf bei guter Konfidenz; bei schlechter werden Ausrichtung,
    Schaerfung/Binarisierung und andere Seitenlayouts probiert und das beste Ergebnis gewaehlt."""
    lang = lang or _pick_lang()
    env = _env()
    base = preprocess(img)
    osd_rot = _detect_rotation(_to_png(base), env)
    base = _rotated(base, osd_rot)
    g = deskew(base)
    first = _tesseract(g, lang, 3, env)
    if first.confidence >= GOOD_CONFIDENCE and first.score >= 15:
        return first
    started = time.monotonic()
    best = first
    with ThreadPoolExecutor(max_workers=3) as pool:
        if not osd_rot:
            rot = _best_rotation(base, lang, env, pool)
            if rot:
                base = _rotated(base, rot)
                g = deskew(base)
                best = first = _tesseract(g, lang, 3, env)
        if time.monotonic() - started > RETRY_BUDGET:
            return best
        jobs = [(_variant(g, "sharp"), 3), (_variant(g, "bw"), 3), (g, 4)]
        for cand in pool.map(lambda j: _tesseract(j[0], lang, j[1], env), jobs):
            if cand.score > best.score:
                best = cand
    return best


def parse_tsv(tsv: str) -> PageText:
    lines: dict[tuple[int, int, int], list[str]] = {}
    confs: list[float] = []
    score = 0.0
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
            if conf >= 60 and sum(c.isalnum() for c in word) >= 2:
                score += conf / 100
    text = "\n".join(" ".join(ws) for _, ws in sorted(lines.items()))
    return PageText(
        text=text, confidence=(sum(confs) / len(confs) / 100) if confs else 0.0, score=score
    )


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

"""Verarbeitung eines Dokuments: OCR, Extraktion, Vorschlaege. Schreibt nur Vorschlaege."""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from collections.abc import Callable
from datetime import date

from ..deadlines import Deadlines
from ..linking import Linking
from ..repo import DOC_TYPES, Repo
from . import ocr, ollama, rules

log = logging.getLogger("syd.pipeline")

LLM_BELOW = 0.7  # Felder unter dieser Konfidenz darf der optionale Ollama-Provider verbessern


class ProcessingError(Exception):
    """Fehler mit stabilem Code; das Dokument bleibt trotzdem manuell nutzbar."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _known_companies(repo: Repo) -> list[tuple[int, str, list[str]]]:
    return [(c["id"], c["name"], c["aliases"]) for c in repo.list_companies()]


def _history_category(repo: Repo, company_id: int) -> int | None:
    rows = repo.v.rows(
        "SELECT category_id FROM document WHERE company_id = ? AND category_id IS NOT NULL"
        " AND state = 'geprueft'",
        (company_id,),
    )
    if not rows:
        return None
    return Counter(r["category_id"] for r in rows).most_common(1)[0][0]


def run_ocr(repo: Repo, document_id: int, recognise: Callable = ocr.recognise) -> tuple[str, float]:
    """OCR ueber alle Teile, Text in ocr_text und Volltextindex, Vorschaubilder."""
    v = repo.v
    parts = v.rows(
        "SELECT page, mime FROM blob_store WHERE document_id = ? ORDER BY page", (document_id,)
    )
    texts: list[str] = []
    confs: list[float] = []
    page_no = 0
    error: ProcessingError | None = None
    for part in parts:
        data = v.read_page(document_id, part["page"])
        try:
            try:
                first = next(ocr.iter_pages(data, part["mime"]), None)
                if first is not None:
                    thumb = ocr.thumbnail(first)
                    v.execute(
                        "INSERT OR REPLACE INTO thumbnail (document_id, page, image) VALUES (?,?,?)",
                        (document_id, part["page"], thumb),
                    )
            except ocr.UnreadableFileError:
                raise
            except Exception:  # Vorschau ist nur Beiwerk
                log.warning("Vorschau fehlgeschlagen", exc_info=False)
            pages = recognise(data, part["mime"])
        except ocr.OcrUnavailableError as exc:
            error = error or ProcessingError("ocr_nicht_verfuegbar", str(exc))
            continue
        except ocr.UnreadableFileError as exc:
            error = error or ProcessingError("datei_unlesbar", str(exc))
            continue
        for p in pages:
            page_no += 1
            texts.append(p.text)
            confs.append(p.confidence)
            v.execute(
                "INSERT OR REPLACE INTO ocr_text (document_id, page, text, confidence) VALUES (?,?,?,?)",
                (document_id, page_no, p.text, p.confidence),
            )
            if p.text.strip():
                v.index_text(document_id, page_no, p.text)
    text = "\n\f\n".join(texts)
    conf = sum(confs) / len(confs) if confs else 0.0
    if error and not text.strip():
        raise error
    return text, conf


def process_document(
    repo: Repo,
    document_id: int,
    *,
    recognise: Callable = ocr.recognise,
    today: date | None = None,
) -> dict:
    """Fuehrt OCR und Extraktion aus und setzt den Zustand `erkannt`.

    Bei Fehlern wird der Zustand trotzdem `erkannt` (mit leeren Vorschlaegen), damit der Nutzer
    das Dokument von Hand ausfuellen kann. Der Fehlercode wird zurueckgegeben.
    """
    v = repo.v
    doc = repo._doc_row(document_id)
    if doc["state"] == "geprueft":
        return {"state": "geprueft", "error": None}
    today = today or repo.today()
    error: ProcessingError | None = None
    text, conf = "", 0.0
    try:
        text, conf = run_ocr(repo, document_id, recognise)
    except ProcessingError as exc:
        error = exc
    v.execute(
        "UPDATE document SET state = 'verarbeitet', ocr_confidence = ? WHERE id = ? AND state <> 'geprueft'",
        (conf, document_id),
    )
    ex = (
        rules.extract(text, known_companies=_known_companies(repo), today=today)
        if text
        else rules.Extraction()
    )
    settings = repo.get_settings()

    if text and settings["ollama_enabled"]:
        weak = [
            f
            for f in ollama.FIELDS_TO_IMPROVE
            if f not in ex.fields or ex.fields[f].confidence < LLM_BELOW
        ]
        if weak:
            try:
                refined = ollama.refine(
                    text, settings["ollama_url"], settings["ollama_model"], DOC_TYPES
                )
                for f in weak:
                    if f in refined:
                        ex.fields[f] = rules.Candidate(refined[f], 0.7, "llm")
                if "firma" in weak and "firma" in refined:
                    found = repo.find_company(refined["firma"])
                    ex.company_id = found["id"] if found else None
            except Exception:
                log.warning("Ollama nicht erreichbar, nutze Regeln", exc_info=False)

    run_id = uuid.uuid4().hex
    with v.tx():
        for name, cand in ex.fields.items():
            v.execute(
                "INSERT INTO extraction (document_id, run_id, field, value, confidence, source)"
                " VALUES (?,?,?,?,?,?)",
                (document_id, run_id, name, None if cand.value is None else str(cand.value),
                 cand.confidence, cand.source),
            )  # fmt: skip
        updates: dict[str, object] = {}
        if ex.company_id:
            updates["company_id"] = ex.company_id
        art = ex.get("art")
        if art and art.value in DOC_TYPES:
            updates["doc_type"] = art.value
        if (c := ex.get("datum")) is not None:
            updates["doc_date"] = c.value
        if (c := ex.get("betrag")) is not None:
            updates["amount_cents"] = c.value
        cat = ex.get("bereich")
        cat_id = None
        if ex.company_id:
            cat_id = _history_category(repo, ex.company_id)
            if cat_id:
                name = v.scalar("SELECT name FROM category WHERE id = ?", (cat_id,))
                v.execute(
                    "INSERT INTO extraction (document_id, run_id, field, value, confidence, source)"
                    " VALUES (?,?,?,?,?,'archiv')",
                    (document_id, run_id, "bereich", name, 0.85),
                )
        if cat_id is None and cat:
            found_cat = repo.find_category(str(cat.value))
            cat_id = found_cat["id"] if found_cat else None
        if cat_id:
            updates["category_id"] = cat_id
        if updates:
            sets = ", ".join(f"{k} = ?" for k in updates)
            v.execute(
                f"UPDATE document SET {sets} WHERE id = ? AND state <> 'geprueft'",
                (*updates.values(), document_id),
            )
        Deadlines(repo).add_suggestions(document_id, ex.deadlines)
        repo.set_references(
            document_id,
            [
                {"type": r["type"], "value": r["value"], "source": "regex", "confirmed": False}
                for r in ex.references
            ],
            source="regex",
        )
        v.execute(
            "UPDATE document SET state = 'erkannt' WHERE id = ? AND state <> 'geprueft'",
            (document_id,),
        )
        v.audit("document.recognised", document_id=document_id)
    try:
        Linking(repo).suggest(document_id)
    except Exception:
        log.warning("Verknüpfungsvorschläge fehlgeschlagen", exc_info=True)
    return {
        "state": "erkannt",
        "error": error.code if error else None,
        "message": error.message if error else None,
    }

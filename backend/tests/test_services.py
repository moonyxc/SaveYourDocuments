from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from synth import DOCS, render, to_bytes, to_pdf_bytes  # noqa: E402

from syd.deadlines import Deadlines  # noqa: E402
from syd.exporter import Exporter  # noqa: E402
from syd.extract import ocr  # noqa: E402
from syd.extract.pipeline import process_document  # noqa: E402
from syd.imports import ImportService  # noqa: E402
from syd.jobs import JobQueue  # noqa: E402
from syd.linking import Linking  # noqa: E402
from syd.repo import ArchiveError, Repo  # noqa: E402
from syd.stats import stats, to_csv  # noqa: E402
from syd.util import format_eur, parse_eur  # noqa: E402
from syd.vault import Vault, generate_key  # noqa: E402

TODAY = date(2024, 6, 1)
needs_ocr = pytest.mark.skipif(not ocr.status()["available"], reason="Tesseract (deu) fehlt")


class Clock:
    def __init__(self, d: date):
        self.d = d

    def __call__(self) -> date:
        return self.d


@pytest.fixture
def clock():
    return Clock(TODAY)


@pytest.fixture
def repo(tmp_path, clock):
    vault = Vault.open(tmp_path / "a.syd", generate_key(), create=True)
    yield Repo(vault, today=clock)
    vault.close()


_counter = iter(range(1, 10_000))


def png(n: int) -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (n % 256, n // 256, 7)).save(buf, "PNG")
    return buf.getvalue()


def make_doc(repo, text_lines=None, name="scan.png", data=None):
    doc_id, _ = repo.v.add_document(name, "image/png", [data or png(next(_counter) + 1000)])
    return doc_id


def fake_recognise(text):
    def fn(data, mime, lang=None):
        return [ocr.PageText(text, 0.95)]

    return fn


# ---------------------------------------------------------------- util


def test_money_parsing_and_formatting():
    assert parse_eur("1.234,56 €") == 123456
    assert parse_eur("49,9") == 4990
    assert parse_eur("49.99") == 4999
    assert parse_eur("12.345") == 1234500
    assert parse_eur("abc") is None
    assert format_eur(123456) == "1.234,56 €"
    assert format_eur(-500) == "-5,00 €"


# ---------------------------------------------------------------- Stammdaten


def test_defaults_seeded_once(repo):
    n = len(repo.list_categories())
    assert n >= 10
    Repo(repo.v)
    assert len(repo.list_categories()) == n
    assert Deadlines(repo).default_leads("zahlungsziel") == [7, 1]
    assert Deadlines(repo).default_leads("kuendigungsfrist") == [30, 7]


def test_company_duplicates_alias_and_merge(repo):
    a = repo.create_company("Vodafone GmbH")
    assert repo.create_company("  vodafone  gmbh ")["id"] == a["id"]
    repo.add_alias(a["id"], "Vodafone")
    assert repo.find_company("VODAFONE")["id"] == a["id"]
    b = repo.create_company("Vodafone Deutschland")
    assert any(s["id"] == a["id"] for s in repo.similar_companies("Vodafone Deutschland GmbH"))
    doc = make_doc(repo)
    repo.update_document(doc, {"company_id": b["id"]})
    repo.merge_companies(b["id"], a["id"])
    assert repo.get_document(doc)["company_id"] == a["id"]
    assert repo.find_company("Vodafone Deutschland")["id"] == a["id"]
    with pytest.raises(ArchiveError):
        repo.merge_companies(a["id"], a["id"])


def test_settings_validation(repo):
    assert repo.update_settings({"font_size": 18})["font_size"] == 18
    with pytest.raises(ArchiveError):
        repo.update_settings({"font_size": 11})
    with pytest.raises(ArchiveError):
        repo.update_settings({"localsend_pin": "12"})
    with pytest.raises(ArchiveError):
        repo.update_settings({"ollama_url": "http://example.com:11434"})
    with pytest.raises(ArchiveError):
        repo.update_settings({"unbekannt": 1})
    assert repo.update_settings({"ollama_url": "http://127.0.0.1:11434"})["ollama_url"]


def test_tags(repo):
    doc = make_doc(repo)
    t = repo.create_tag("Steuer 2024", "#ff0000")
    assert repo.create_tag("steuer 2024")["id"] == t["id"]
    repo.set_document_tags(doc, [t["id"]])
    assert [x["name"] for x in repo.get_document(doc)["tags"]] == ["Steuer 2024"]
    assert repo.list_documents(tag_ids=[t["id"]])["total"] == 1
    repo.delete_tag(t["id"])
    assert repo.get_document(doc)["tags"] == []
    with pytest.raises(ArchiveError):
        repo.create_tag("x", "rot")


# ---------------------------------------------------------------- Dokumente


def test_confirm_flow_history_and_validation(repo):
    doc = make_doc(repo)
    with pytest.raises(ArchiveError) as e:
        repo.confirm_document(doc, {"doc_date": "2024-13-45"})
    assert e.value.code == "ungueltig"
    with pytest.raises(ArchiveError) as e:
        repo.confirm_document(doc, {}, company_name="Neue Firma")
    assert e.value.code == "neue_firma"
    d = repo.confirm_document(
        doc, {"doc_date": "2024-02-03", "amount_cents": 1999, "doc_type": "Rechnung"},
        company_name="Neue Firma", create_company=True,
    )  # fmt: skip
    assert d["state"] == "geprueft" and d["company_name"] == "Neue Firma"
    assert d["reviewed_at"]
    repo.update_document(doc, {"amount_cents": 2999})
    hist = repo.get_document(doc)["history"]
    assert any(
        h["field"] == "amount_cents" and h["old"] == "1999" and h["new"] == "2999" for h in hist
    )
    # die Feldhistorie ist append-only
    with pytest.raises(Exception, match="append-only"):
        repo.v.execute("UPDATE field_history SET new = 'x'")


def test_display_name_template(repo):
    doc = make_doc(repo)
    repo.confirm_document(
        doc, {"doc_date": "2024-02-03", "amount_cents": 4990, "doc_type": "Rechnung"},
        company_name="Telekom", create_company=True,
    )  # fmt: skip
    assert repo.get_document(doc)["display_name"] == "Telekom_Rechnung_2024-02-03_49,90 €.png"
    repo.update_settings({"display_name_template": "{firma}_{bereich}_{datum}"})
    assert repo.get_document(doc)["display_name"] == "Telekom_2024-02-03.png"
    repo.update_settings({"display_name_enabled": False})
    assert repo.get_document(doc)["display_name"] == "scan.png"


def test_search_and_filters(repo):
    ids = []
    for i, (firma, art, cents, day) in enumerate(
        [("Telekom", "Rechnung", 4990, "2024-01-10"), ("Allianz", "Vertrag", 31240, "2023-05-02")]
    ):
        d = make_doc(repo, data=b"\x89PNG\r\n\x1a\n" + bytes([i]))
        repo.confirm_document(d, {"doc_date": day, "amount_cents": cents, "doc_type": art},
                              company_name=firma, create_company=True)  # fmt: skip
        ids.append(d)
    repo.v.index_text(ids[0], 1, "Mobilfunkvertrag Tarif Red M")
    assert repo.list_documents(q="telekom")["total"] == 1
    assert repo.list_documents(q="Tarif")["items"][0]["id"] == ids[0]
    assert repo.list_documents(q="312,40")["items"][0]["id"] == ids[1]
    assert repo.list_documents(date_from="2024-01-01")["total"] == 1
    assert repo.list_documents(amount_min=10000)["total"] == 1
    assert repo.list_documents(doc_type="Vertrag")["total"] == 1
    assert repo.list_documents(sort="betrag_ab")["items"][0]["id"] == ids[1]
    repo.archive_document(ids[0], "Test")
    assert repo.list_documents()["total"] == 1
    assert repo.list_documents(archived="ja")["total"] == 2
    assert repo.list_documents(archived="nur")["total"] == 1
    with pytest.raises(ArchiveError):
        repo.archive_document(ids[1], "  ")


def test_never_delete_documents(repo):
    doc = make_doc(repo)
    with pytest.raises(Exception, match="nur archiviert"):
        repo.v.execute("DELETE FROM document WHERE id = ?", (doc,))


# ---------------------------------------------------------------- Fristen


def reviewed(repo, deadlines, firma="Telekom", doc_type="Vertrag", data=b"\x89PNG\r\n\x1a\nA"):
    d = make_doc(repo, data=data)
    repo.confirm_document(d, {"doc_date": "2024-01-10", "doc_type": doc_type, "amount_cents": 1000},
                          company_name=firma, create_company=True, deadlines=deadlines)  # fmt: skip
    return d


def test_unconfirmed_deadlines_make_no_reminders(repo, clock):
    d = make_doc(repo)
    dl = Deadlines(repo)
    dl.add_suggestions(d, [{"type": "zahlungsziel", "due_date": "2024-06-05"}])
    assert dl.list() == []
    clock.d = date(2024, 6, 10)
    assert dl.tick()["fired"] == []
    assert repo.v.scalar("SELECT count(*) FROM reminder") == 0


def test_reminders_fire_once_and_catch_up_without_flood(repo, clock):
    d = reviewed(repo, [{"type": "zahlungsziel", "due_date": "2024-06-20"}])
    dl = Deadlines(repo)
    assert (
        repo.v.scalar(
            "SELECT count(*) FROM reminder WHERE deadline_id IN (SELECT id FROM deadline WHERE document_id=?)",
            (d,),
        )
        == 2
    )
    clock.d = date(2024, 6, 12)
    assert dl.tick()["fired"] == []
    clock.d = date(2024, 6, 13)
    assert len(dl.tick()["fired"]) == 1
    assert dl.tick()["fired"] == []  # idempotent
    due = dl.due_reminders()
    assert len(due) == 1 and due[0]["lead"] == 7
    dl.dismiss(due[0]["reminder_id"])
    assert dl.due_reminders() == []
    # App war lange aus: beide Erinnerungen sind faellig, nur die naechstliegende erscheint
    clock.d = date(2024, 6, 25)
    fired = dl.tick()["fired"]
    assert len(fired) == 1
    assert [r["lead"] for r in dl.due_reminders()] == [1]


def test_snooze_returns_later(repo, clock):
    reviewed(repo, [{"type": "zahlungsziel", "due_date": "2024-06-03", "lead_days": [1]}])
    dl = Deadlines(repo)
    clock.d = date(2024, 6, 2)
    dl.tick()
    rid = dl.due_reminders()[0]["reminder_id"]
    dl.snooze(rid, 1)
    assert dl.due_reminders() == []
    clock.d = date(2024, 6, 3)
    assert len(dl.tick()["fired"]) == 1


def test_paid_closes_payment_deadlines(repo, clock):
    d = reviewed(repo, [{"type": "zahlungsziel", "due_date": "2024-06-20"}], doc_type="Rechnung")
    dl = Deadlines(repo)
    clock.d = date(2024, 6, 15)
    dl.tick()
    assert len(dl.due_reminders()) == 1
    repo.set_paid(d, True)
    assert dl.due_reminders() == []
    assert dl.list() == []
    repo.set_paid(d, False)
    assert len(dl.list()) == 1


def test_overdue_payment_stays_visible(repo, clock):
    reviewed(repo, [{"type": "zahlungsziel", "due_date": "2024-05-01"}], doc_type="Rechnung")
    items = Deadlines(repo).list()
    assert items and items[0]["overdue"] and items[0]["days_left"] < 0


def test_recurring_deadline_rolls_forward_and_cancel_link_stops_it(repo, clock):
    d = reviewed(
        repo, [{"type": "kuendigungsfrist", "due_date": "2024-09-30", "repeat_months": 12}]
    )
    dl = Deadlines(repo)
    clock.d = date(2024, 10, 2)
    dl.tick()
    nxt = [x for x in dl.list() if x["due_date"] == "2025-09-30"]
    assert len(nxt) == 1 and nxt[0]["repeat_months"] == 12
    assert repo.v.scalar("SELECT status FROM deadline WHERE due_date='2024-09-30'") == "abgelaufen"
    assert (
        repo.v.scalar(
            "SELECT count(*) FROM reminder WHERE deadline_id=? AND state='offen'", (nxt[0]["id"],)
        )
        == 2
    )
    # Kuendigung verknuepft: keine weitere Wiederholung
    k = reviewed(repo, [], doc_type="Kündigung", data=b"\x89PNG\r\n\x1a\nB")
    Linking(repo).create(k, d, "antwort_auf")
    clock.d = date(2025, 10, 5)
    dl.tick()
    assert not [x for x in dl.list() if x["due_date"] > "2025-10-05"]


def test_deadline_validation(repo):
    d = reviewed(repo, [])
    dl = Deadlines(repo)
    with pytest.raises(ArchiveError):
        dl.create(d, {"type": "zahlungsziel", "due_date": "morgen"})
    with pytest.raises(ArchiveError):
        dl.create(d, {"type": "quatsch", "due_date": "2024-07-01"})
    with pytest.raises(ArchiveError):
        dl.create(d, {"type": "zahlungsziel", "due_date": "2024-07-01", "lead_days": [-1]})
    created = dl.create(d, {"type": "sonstige", "due_date": "2024-07-01", "lead_days": [3, 3, 10]})
    assert created["lead_days"] == [10, 3]


# ---------------------------------------------------------------- Verknuepfung


def test_link_suggestions_and_rejection_is_remembered(repo):
    a = make_doc(repo, data=b"\x89PNG\r\n\x1a\nA")
    b = make_doc(repo, data=b"\x89PNG\r\n\x1a\nB")
    c = make_doc(repo, data=b"\x89PNG\r\n\x1a\nC")
    for doc, firma, typ, day, ref in [
        (a, "Allianz", "Schadenmeldung", "2024-01-05", "SCH-2024-77"),
        (b, "Allianz", "Schreiben", "2024-02-01", "sch 2024 77"),
        (c, "Anderer", "Schreiben", "2024-03-01", "SCH-2024-77"),
    ]:
        repo.confirm_document(doc, {"doc_date": day, "doc_type": typ}, company_name=firma, create_company=True,
                              references=[{"type": "schadennummer", "value": ref}])  # fmt: skip
    link = Linking(repo)
    sug = link.suggest(b)
    by_other = {s["other"]["id"]: s for s in sug}
    assert by_other[a]["score"] == 100 and by_other[a]["direction"] == "ausgehend"
    assert by_other[a]["type"] == "antwort_auf"
    assert by_other[c]["score"] == 60
    link.reject(by_other[c]["id"])
    assert c not in {s["other"]["id"] for s in link.suggest(b)}
    link.confirm(by_other[a]["id"])
    assert [x["status"] for x in link.links(a)] == ["bestaetigt"]
    assert link.links(a)[0]["direction"] == "eingehend"


def test_company_alone_gives_no_suggestion(repo):
    a = make_doc(repo, data=b"\x89PNG\r\n\x1a\nA")
    b = make_doc(repo, data=b"\x89PNG\r\n\x1a\nB")
    for d in (a, b):
        repo.confirm_document(
            d, {"doc_date": "2024-01-05"}, company_name="Allianz", create_company=True
        )
    assert Linking(repo).suggest(a) == []


# ---------------------------------------------------------------- Erkennung (echte OCR)


@needs_ocr
def test_pipeline_on_synthetic_german_invoice(repo):
    doc = DOCS[0]
    data = to_bytes(render(doc))
    doc_id, _ = repo.v.add_document("scan.png", "image/png", [data])
    res = process_document(repo, doc_id, today=TODAY)
    assert res["error"] is None
    d = repo.get_document(doc_id)
    assert d["state"] == "erkannt"
    assert (
        d["doc_date"] == "2024-03-12" and d["amount_cents"] == 4994 and d["doc_type"] == "Rechnung"
    )
    assert d["category_name"] == "Telekom & Internet" or d["category_name"] == "Telefon & Internet"
    assert {r["type"] for r in d["references"]} >= {"rechnungsnummer", "kundennummer"}
    assert repo.v.search("Mobilfunk") == [doc_id]
    assert repo.v.scalar("SELECT count(*) FROM thumbnail WHERE document_id=?", (doc_id,)) == 1
    sugg = Deadlines(repo).suggestions(doc_id)
    assert sugg and sugg[0]["type"] == "zahlungsziel" and not sugg[0]["confirmed"]
    # Nutzer bestaetigt: jetzt gibt es Erinnerungen
    out = repo.confirm_document(doc_id, {}, company_name="Vodafone GmbH", create_company=True,
                                deadlines=[{"id": sugg[0]["id"]}])  # fmt: skip
    assert out["state"] == "geprueft"
    assert [x["due_date"] for x in Deadlines(repo).list()] == ["2024-03-26"]


@needs_ocr
def test_pipeline_pdf_and_known_company_and_category_memory(repo):
    first = DOCS[0]
    id1, _ = repo.v.add_document("a.png", "image/png", [to_bytes(render(first))])
    process_document(repo, id1, today=TODAY)
    repo.confirm_document(id1, {"category_id": repo.find_category("Telefon & Internet")["id"]},
                          company_name="Vodafone GmbH", create_company=True)  # fmt: skip
    second = DOCS[0]
    pdf = to_pdf_bytes(render(second, noise=True))
    id2, _ = repo.v.add_document("b.pdf", "application/pdf", [pdf])
    res = process_document(repo, id2, today=TODAY)
    d = repo.get_document(id2)
    assert res["error"] is None
    assert d["company_name"] == "Vodafone GmbH"  # bekannte Firma wird zuerst gesucht
    assert d["category_name"] == "Telefon & Internet"
    assert d["amount_cents"] == 4994


def test_pipeline_ocr_failure_keeps_document_usable(repo):
    doc_id = make_doc(repo)

    def broken(data, mime, lang=None):
        raise ocr.OcrUnavailableError("Tesseract fehlt")

    res = process_document(repo, doc_id, recognise=broken)
    assert res["error"] == "ocr_nicht_verfuegbar"
    assert repo.get_document(doc_id)["state"] == "erkannt"
    out = repo.confirm_document(
        doc_id, {"doc_date": "2024-01-01"}, company_name="Z", create_company=True
    )
    assert out["state"] == "geprueft"


def test_pipeline_never_overwrites_reviewed_document(repo):
    d = reviewed(repo, [])
    process_document(repo, d, recognise=fake_recognise("Rechnung Gesamtbetrag 5,00 €"))
    assert repo.get_document(d)["amount_cents"] == 1000


def test_batch_confirm_only_high_confidence(repo):
    text = "Telekom GmbH\nRechnung\nDatum: 05.02.2024\nGesamtbetrag 10,00 €\n"
    repo.create_company("Telekom GmbH")
    ok = make_doc(repo)
    process_document(repo, ok, recognise=fake_recognise(text), today=TODAY)
    unknown = make_doc(repo)
    process_document(
        repo, unknown, recognise=fake_recognise("Irgendwas\nDatum: 05.02.2024\n"), today=TODAY
    )
    res = repo.batch_confirm()
    assert res["confirmed"] == [ok] and res["skipped"] == [unknown]
    repo.update_settings({"batch_confirm_enabled": False})
    with pytest.raises(ArchiveError):
        repo.batch_confirm()


# ---------------------------------------------------------------- Jobs


def test_job_queue_runs_and_recovers(repo):
    doc = make_doc(repo)
    repo.v.execute(
        "INSERT INTO job (document_id, kind, state, created_at, updated_at) VALUES (?, 'process', 'laeuft', 'x', 'x')",
        (doc,),
    )
    q = JobQueue(
        repo.v,
        lambda did: process_document(
            repo, did, recognise=fake_recognise("Rechnung\nDatum: 05.02.2024")
        ),
    )
    repo.v.execute("UPDATE job SET state = 'wartend' WHERE state = 'laeuft'")
    assert q.run_pending() == 1
    assert q.counts()["fertig"] == 1
    assert repo.get_document(doc)["state"] == "erkannt"

    def boom(did):
        raise RuntimeError("x")

    q2 = JobQueue(repo.v, boom)
    q2.enqueue(doc)
    q2.run_pending()
    assert q2.counts()["fehler"] == 1


# ---------------------------------------------------------------- Import


def test_import_stage_group_commit(repo, tmp_path):
    seen = []
    imp = ImportService(repo, tmp_path / "eingang", on_new_document=seen.append)
    res = imp.stage_uploads(
        [
            ("a.png", png(1)),
            ("b.png", png(2)),
            ("c.png", png(3)),
            ("x.exe", b"MZ\x00"),
            ("e.pdf", b""),
        ]
    )
    assert res["files"] == 3 and len(res["rejected"]) == 2
    batch = imp.pending()[0]
    ids = [f["id"] for f in batch["files"]]
    with pytest.raises(ArchiveError) as e:
        imp.commit(batch["id"], [[ids[0], ids[1]]])
    assert e.value.code == "unvollstaendig"
    out = imp.commit(batch["id"], [[ids[0], ids[1]]], discard=[ids[2]])
    assert len(out["created"]) == 1 and len(out["archived"]) == 1
    assert seen == out["created"]
    doc = repo.get_document(out["created"][0])
    assert doc["pages"] == 2 and [p["name"] for p in doc["parts"]] == ["a.png", "b.png"]
    arch = repo.get_document(out["archived"][0])
    assert arch["archived"] and arch["archive_reason"] == "Beim Import aussortiert"
    assert imp.pending() == []
    assert not list((tmp_path / "eingang").glob("u-*/*"))
    assert repo.v.scalar("SELECT count(*) FROM job WHERE state='wartend'") == 1


def test_import_rejects_oversize_and_duplicates(repo, tmp_path):
    imp = ImportService(repo, tmp_path / "eingang")
    repo.update_settings({"max_file_mb": 1})
    res = imp.stage_uploads([("big.png", png(1) + b"\0" * (2 * 1024 * 1024))])
    assert res["batch_id"] is None and "größer" in res["rejected"][0]["reason"]
    imp.stage_uploads([("a.png", png(5))])
    b1 = imp.pending()[0]
    imp.commit(b1["id"], [[b1["files"][0]["id"]]])
    imp.stage_uploads([("again.png", png(5))])
    b2 = imp.pending()[0]
    out = imp.commit(b2["id"], [[b2["files"][0]["id"]]])
    assert out["created"] == [] and len(out["duplicates"]) == 1


# ---------------------------------------------------------------- Export / Statistik


def seeded(repo):
    rows = [
        ("Telekom", "Rechnung", 4990, "2024-01-10", "Telefon & Internet"),
        ("Telekom", "Rechnung", 5990, "2024-02-10", "Telefon & Internet"),
        ("Allianz", "Versicherungsschein", 31240, "2023-05-02", "Versicherung"),
        ("Telekom", "Mahnung", 5000, "2024-03-01", "Telefon & Internet"),
    ]
    ids = []
    for i, (firma, art, cents, day, cat) in enumerate(rows):
        d = make_doc(repo, data=b"\x89PNG\r\n\x1a\nS" + bytes([i]))
        repo.confirm_document(d, {"doc_date": day, "amount_cents": cents, "doc_type": art,
                                  "category_id": repo.find_category(cat)["id"]},
                              company_name=firma, create_company=True)  # fmt: skip
        ids.append(d)
    return ids


def test_stats_only_reviewed_and_default_exclusions(repo):
    ids = seeded(repo)
    make_doc(repo, data=b"\x89PNG\r\n\x1a\nUNREVIEWED")
    r = stats(repo, group_by="firma")
    assert {x["label"]: x["sum_cents"] for x in r["rows"]} == {"Allianz": 31240, "Telekom": 10980}
    assert r["total_cents"] == 42220
    assert stats(repo, group_by="jahr")["rows"][0]["label"] == "2023"
    assert stats(repo, group_by="firma", doc_types=["Mahnung"])["total_cents"] == 5000
    assert stats(repo, group_by="bereich")["rows"][0]["label"] == "Versicherung"
    repo.archive_document(ids[2], "x")
    assert stats(repo)["total_cents"] == 10980
    csv_text = to_csv(stats(repo))
    assert csv_text.startswith("\ufeffGruppe;Summe in Euro") and "109,80" in csv_text


def test_csv_blocks_formula_injection(repo):
    d = make_doc(repo)
    repo.confirm_document(
        d, {"amount_cents": 100}, company_name="=HYPERLINK(1)", create_company=True
    )
    assert "'=HYPERLINK" in to_csv(stats(repo))


def test_export_plan_names_collisions_and_zip(repo, tmp_path):
    ids = seeded(repo)
    ex = Exporter(repo)
    plan = ex.plan(path_template="{firma}/{jahr}", file_template="{art}")
    targets = [p["target"] for p in plan]
    assert "Telekom/2024/Rechnung.png" in targets and "Telekom/2024/Rechnung (2).png" in targets
    d = make_doc(repo, data=b"\x89PNG\r\n\x1a\nE")
    repo.confirm_document(d, {"doc_type": "A:B*C?"}, company_name="CON", create_company=True)
    t = [
        p["target"]
        for p in ex.plan(path_template="{firma}/{jahr}", file_template="{art}")
        if p["document_id"] == d
    ][0]
    assert t == "_CON/Unbekannt/A-B-C-.png"
    summary = ex.run(plan, tmp_path / "out")
    assert summary["files"] == len(plan)
    assert (
        (tmp_path / "out" / "Allianz" / "2023" / "Versicherungsschein.png")
        .read_bytes()
        .startswith(b"\x89PNG")
    )
    z = ex.run(plan, tmp_path / "out2.zip", as_zip=True)
    import zipfile

    assert sorted(zipfile.ZipFile(z["destination"]).namelist()) == sorted(targets)
    assert not repo.list_documents(archived="nur")["total"]  # Export aendert nichts
    assert ex.plan(path_template="{firma}", file_template="{id}", document_ids=[ids[0]])[0][
        "target"
    ].startswith("Telekom/")


def test_export_template_validation(repo):
    ex = Exporter(repo)
    with pytest.raises(ArchiveError):
        ex.save_template("x", "{firma}/../{jahr}", "{id}", False)
    with pytest.raises(ArchiveError):
        ex.save_template("x", "C:/Temp", "{id}", False)
    with pytest.raises(ArchiveError):
        ex.save_template("x", "{firma}", "{nope}", False)
    assert ex.save_template("Kurz", "{jahr}", "{id}", True)["id"]
    assert len(ex.templates()) == 2


def test_multipart_export_suffixes(repo, tmp_path):
    d, _ = repo.v.add_document(
        "m.png", "image/png", [png(7), png(8)], mimes=["image/png"] * 2, names=["1.png", "2.png"]
    )
    repo.confirm_document(d, {"doc_date": "2024-01-01"}, company_name="Firma", create_company=True)
    t = [p["target"] for p in Exporter(repo).plan(path_template="{firma}", file_template="{datum}")]
    assert t == ["Firma/2024-01-01_S1.png", "Firma/2024-01-01_S2.png"]

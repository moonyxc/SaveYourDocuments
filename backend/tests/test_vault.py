import os

import pytest
import sqlcipher3

from syd.vault import (
    MIGRATIONS,
    Vault,
    VaultMissingError,
    WrongKeyError,
    format_recovery_key,
    generate_key,
    parse_recovery_key,
)


@pytest.fixture
def path(tmp_path):
    return tmp_path / "archiv.syd"


def test_file_is_encrypted_and_wrong_key_rejected(path):
    key = generate_key()
    with Vault.open(path, key, create=True) as v:
        v.add_document("brief.jpg", "image/jpeg", [b"GEHEIM" * 100])
    raw = path.read_bytes()
    assert b"SQLite format 3" not in raw[:16]
    assert b"GEHEIM" not in raw
    with pytest.raises(WrongKeyError):
        Vault.open(path, generate_key())
    with pytest.raises(WrongKeyError):
        Vault.open(path, "falsches passwort")
    with Vault.open(path, key) as v:
        assert v.get_document(1)["original_name"] == "brief.jpg"


def test_missing_file_does_not_create_empty_archive(path):
    with pytest.raises(VaultMissingError):
        Vault.open(path, generate_key())
    assert not path.exists()


def test_fts5_search_german_and_archive_filter(path):
    with Vault.open(path, generate_key(), create=True) as v:
        a, _ = v.add_document("a.pdf", "application/pdf", [b"a"])
        b, _ = v.add_document("b.pdf", "application/pdf", [b"b"])
        v.index_text(a, 1, "Haftpflichtversicherung Beitragsrechnung für Müller")
        v.index_text(b, 1, "Kaufbeleg Waschmaschine")
        assert v.search("haftpflicht") == [a]
        assert v.search("muller") == [a]  # Diakritika werden ignoriert
        assert v.search("Waschmaschine kauf") == [b]
        assert v.search('" OR 1=1 --') == []  # kein FTS-Syntax durchreichen
        v.archive(a, "Testdaten")
        assert v.search("haftpflicht") == []
        assert v.search("haftpflicht", include_archived=True) == [a]
        v.restore(a)
        assert v.search("haftpflicht") == [a]


def test_blob_roundtrip_and_incremental_stream(path):
    data = os.urandom(3 * 1024 * 1024 + 17)
    with Vault.open(path, generate_key(), create=True) as v:
        doc, dup = v.add_document("foto.jpg", "image/jpeg", [data, b"seite2"])
        assert not dup
        chunks = list(v.stream_page(doc, 1, chunk=1024 * 1024))
        assert len(chunks) == 4 and max(map(len, chunks)) <= 1024 * 1024
        assert b"".join(chunks) == data
        assert v.read_page(doc, 2) == b"seite2"
        assert v.integrity_check()


def test_hash_dedup(path):
    with Vault.open(path, generate_key(), create=True) as v:
        first, dup1 = v.add_document("x.jpg", "image/jpeg", [b"same"])
        second, dup2 = v.add_document("y.jpg", "image/jpeg", [b"same"])
        assert (dup1, dup2) == (False, True) and first == second


def test_never_delete(path):
    with Vault.open(path, generate_key(), create=True) as v:
        doc, _ = v.add_document("x.jpg", "image/jpeg", [b"x"])
        with pytest.raises(sqlcipher3.DatabaseError, match="nur archiviert"):
            v._conn.execute("DELETE FROM document WHERE id = ?", (doc,))
        with pytest.raises(sqlcipher3.DatabaseError, match="nur archiviert"):
            v._conn.execute("DELETE FROM blob_store WHERE document_id = ?", (doc,))
        with pytest.raises(ValueError):
            v.archive(doc, "  ")
        v.archive(doc, "Fehlimport")
        d = v.get_document(doc)
        assert d["archived"] == 1 and d["archive_reason"] == "Fehlimport"


def test_audit_log_ids_only_and_append_only(path):
    with Vault.open(path, generate_key(), create=True) as v:
        doc, _ = v.add_document("Firma GmbH 49,99.pdf", "application/pdf", [b"x"])
        v.set_state(doc, "erkannt")
        v.audit("device.accepted", device_id=3, batch_id=1)
        with pytest.raises(TypeError):
            v.audit("document.corrected", document_id="Telekom GmbH")
        with pytest.raises(ValueError):
            v.audit("document.corrected", document_id=doc, field="Betrag 49,99")
        rows = v.audit_day(v._conn.execute("SELECT day FROM audit_log").fetchone()[0])
        assert [r["event"] for r in rows] == [
            "document.imported",
            "document.state_changed",
            "device.accepted",
        ]
        with pytest.raises(sqlcipher3.DatabaseError, match="append-only"):
            v._conn.execute("UPDATE audit_log SET event = 'x'")
        with pytest.raises(sqlcipher3.DatabaseError, match="append-only"):
            v._conn.execute("DELETE FROM audit_log")
        assert "Telekom" not in str(rows) and "49,99" not in str(rows)


def test_rekey_key_to_password_and_back(path):
    key = generate_key()
    with Vault.open(path, key, create=True) as v:
        v.add_document("x.jpg", "image/jpeg", [b"x"])
        v.rekey("mein passwort mit ' Hochkomma")
    with pytest.raises(WrongKeyError):
        Vault.open(path, key)  # nur ein aktiver Schluessel
    with Vault.open(path, "mein passwort mit ' Hochkomma") as v:
        assert v.get_document(1)["original_name"] == "x.jpg"
        v.rekey(key)
    with Vault.open(path, key) as v:
        assert v.integrity_check()


def test_recovery_key_roundtrip():
    key = generate_key()
    text = format_recovery_key(key)
    assert parse_recovery_key(text) == key
    assert parse_recovery_key(text.lower().replace("-", " ")) == key
    with pytest.raises(ValueError):
        parse_recovery_key("ABCD-EFGH")


def test_backup_opens_with_same_key_and_refuses_overwrite(path, tmp_path):
    key = generate_key()
    dest = tmp_path / "stick" / "kopie.syd"
    dest.parent.mkdir()
    with Vault.open(path, key, create=True) as v:
        doc, _ = v.add_document("x.jpg", "image/jpeg", [os.urandom(500_000)])
        v.backup_to(dest)
        with pytest.raises(Exception, match="existiert"):
            v.backup_to(dest)
        expected = v.read_page(doc, 1)
    with Vault.open(dest, parse_recovery_key(format_recovery_key(key))) as copy:
        assert copy.read_page(doc, 1) == expected
        assert copy.integrity_check()


def test_migration_version(path):
    key = generate_key()
    with Vault.open(path, key, create=True) as v:
        assert v.schema_version == len(MIGRATIONS)
    with Vault.open(path, key) as v:
        assert v.schema_version == len(MIGRATIONS)

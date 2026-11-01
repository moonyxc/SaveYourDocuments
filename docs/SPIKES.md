# Spike-Ergebnisse (Stand 2026-11-01)

Entwicklungsumgebung: Linux (Codespace), Python 3.14, SQLCipher 4.12 (`sqlcipher3-wheels`). **Nichts davon ist auf Windows 11 geprueft.** Die Abnahmekriterien aus PLAN.md Abschnitt 5 sind deshalb nur teilweise erfuellt.

## S2: SQLCipher + FTS5 + Einzeldatei (`backend/syd/vault.py`)

| Kriterium | Ergebnis |
|---|---|
| Verschluesselte DB mit FTS5, durchsuchbar | bestanden (Linux). `ENABLE_FTS5` aktiv, Umlaute/Diakritika per `unicode61 remove_diacritics 2`, Suchtext wird als Woerter behandelt (kein FTS-Syntax, getestet mit Injection-Eingabe) |
| Datei ohne Schluessel unlesbar, falscher Schluessel abgelehnt | bestanden, kein Klartext in der Datei |
| Missing-File-Verhalten | `VaultMissingError`, es wird **kein** leeres Archiv angelegt |
| Inkrementeller BLOB-I/O | bestanden (`open_blob`, 256-KiB-Stuecke) |
| Rekey Schluessel <-> Passwort | bestanden. Es gilt immer nur ein Schluessel (der alte wird nach dem Rekey abgelehnt) |
| Wiederherstellungsschluessel | 32 Byte, Base32 in 4er-Gruppen, Rundlauf getestet. Gilt nur im Schluesselmodus, nach Wechsel auf Passwort ist er ungueltig. Die UI muss nach jedem Wechsel zu Schluesselmodus einen neuen anzeigen |
| Sicherung per Backup-Funktion | bestanden, Kopie oeffnet mit demselben Schluessel, Ueberschreiben wird abgelehnt |
| Nie loeschen | Trigger blockieren `DELETE` auf `document` und `blob_store`, `audit_log` ist append-only |
| Audit-Log nur IDs | `audit()` akzeptiert nur Ganzzahl-IDs und Feldnamen `[a-z0-9_]`, getestet |
| Seitengroesse | 8192 funktioniert, muss aber bei **jedem** Oeffnen gesetzt werden (SQLCipher speichert sie nicht) |

**Messung** (`python scripts/bench_blobs.py 500 4`, Zufallsdaten, SSD im Codespace): 500 Fotos a 4 MB = 2097 MB Nutzdaten, Datei 2119 MB (Overhead +1,06 %), Schreiben 128 MB/s, Lesen 437 MB/s, Backup 16,5 s, Integritaetspruefung 12,7 s. Wert fuer Windows und mit echten Scans noch zu messen.

**Offen (nur Windows pruefbar):** Windows-Wheel fuer die gewaehlte Python-Version, PyInstaller-Einbindung, Schluessel an das Windows-Konto binden (DPAPI), USB-Test (exFAT/NTFS, FAT32-Limit), Oeffnen an einem zweiten PC.
Die Schluesselbindung ist bewusst noch nicht implementiert: `Vault.open` nimmt den Schluessel entgegen, die Quelle (DPAPI) kommt in M1 hinter einer kleinen Schnittstelle.

## S5: LocalSend-Empfaenger (`backend/syd/localsend.py`)

Grundlage: Protokoll v2.2 (https://github.com/localsend/protocol), implementiert wurde die Empfaengerseite: `info`, `register`, `prepare-upload` (PIN, Teil-Annahme), `upload`, `cancel`, Multicast-Ankuendigung und HTTP-`register` als Antwort, selbstsigniertes Zertifikat mit SHA-256-Fingerabdruck. Eigener Code, keine Uebernahme aus der LocalSend-App (Lizenzfrage damit nicht beruehrt).

| Kriterium | Ergebnis |
|---|---|
| Mehrere Fotos als ein Stapel in der Quarantaene | bestanden (Test mit 3 Dateien, ein `on_batch`-Aufruf) |
| Unbekannte Geraete nicht stillschweigend akzeptiert | bestanden: Standard-Entscheider lehnt ab, Timeout = Ablehnung, Vertrauensliste ueberspringt die Rueckfrage |
| Annahme/Ablehnung, Teil-Annahme | bestanden |
| Absicherung | nur Bild/PDF (Absenderangabe **und** Dateikopf), Groessenlimit, bereinigte Dateinamen (Pfad, Windows-Sonderzeichen, reservierte Namen), SHA-256-Pruefung (422), nur eine Sitzung gleichzeitig (409, veraltete Sitzungen laufen ab), Token pro Datei plus Absender-IP, Rate-Limit (429), Abbruch raeumt die Quarantaene auf |
| HTTPS mit selbstsigniertem Zertifikat | bestanden (echter uvicorn-Server in einem Test) |

**Bekannte Grenze:** LocalSend v2.2 unterstuetzt Client-Zertifikate fuer HTTPS-Registrierungen; SaveYourDocuments verwendet dafuer seine gespeicherte Geraeteidentitaet. Der HTTPS-Empfaenger fordert fuer eingehende Uploads jedoch aktuell kein Client-Zertifikat an. Die Vertrauensliste beruht deshalb weiterhin auf der **behaupteten** Kennung aus der Anfrage und ist faelschbar. Empfehlung: Auto-Annahme erst nach bewusster Aktivierung, im Zweifel immer Rueckfrage. `Receiver(trusted_fingerprints=...)` ist standardmaessig leer.

**Offen:** Test mit der echten LocalSend-App auf dem Handy, Multicast im Heimnetz, Windows-Firewall, tatsaechliches Binden des UDP-Sockets (`start_multicast` ist nur durch einen Handler-Test abgedeckt, nicht in einem echten Netz), PIN-Wiederholungsschutz.

## M0b: Klickprototyp (`prototype/index.html`)

Eine HTML-Datei ohne Abhaengigkeiten, Doppelklick zum Oeffnen. Enthaelt Startansicht, Fotos sortieren (Mehrseiter bilden), Pruefansicht mit Konfidenz, "Neue Firma"-Dialog, Verknuepfungsvorschlag, Dokumentliste mit Suche/Filtern, Fristen-Zeitleiste, Auswertung (Tabelle und Diagramme), Einstellungen (Schriftgroesse, Metadaten im Namen). Durchgehend per Playwright-Klicktest geprueft (kein Konsolenfehler), Mobilbreite (420 px) ohne Seitenmenue.

Umgesetzte Korrekturen an DESIGN.md (4.8.1), Kontrast nach WCAG nachgerechnet:

| Stelle | DESIGN.md | Prototyp |
|---|---|---|
| Platzhalter, Zeitstempel | `text-faint` 3.04 bis 3.96 | `text-muted` 5.78 |
| Primary-Button | `accent-primary` 3.68 | `#2563eb` 5.17 |
| Danger-Button | `error` 3.76 | `#b91c1c` 6.47 |
| Aktiver Menuepunkt | Blau auf Blau 2.37 | weiss auf `accent-muted` 8.72 |
| `info` | 4.19 | `#a78bfa` 6.52 |
| Akzent als Text | 3.99 auf Hover | `#60a5fa` 5.77 bis 6.98 |
| Fehlertext | `error` 4.71 | `#f87171` 6.41 |
| Grundschrift | 14 px | 16 px, einstellbar 14/16/18 |

Status wird nie nur ueber Farbe gezeigt (Symbol + Text: ✓ sicher, ▲ bitte pruefen, ● offen). Schriften: im Prototyp Systemschrift-Fallback, Inter/JetBrains Mono muessen in der App lokal mitgeliefert werden (Lizenz pruefen).
Nicht umgesetzt im Prototyp: Hell-Variante, Tastaturkuerzel der Pruefansicht, Erststart-Assistent.

## Gesamtstand nach Umsetzung von M1 bis M8 (Linux)

Verifiziert unter Linux (Codespace):

- Backend: 75 Tests (Verschluesselung, Dienste, API, LocalSend-Dienst, OCR auf synthetischen Dokumenten), `ruff` sauber.
- Oberflaeche: Ende-zu-Ende mit Playwright/Chromium gegen das echte Backend durchgespielt (Einrichtung mit Wiederherstellungsschluessel, Upload, Sortieren, Erkennung, Pruefen inkl. neue Firma und Fristbestaetigung, Dokumente, Fristen, Auswertung, Export, Einstellungen). Keine Konsolen- oder HTTP-Fehler.
- Huelle (Tauri 2): `cargo build` und Start unter Xvfb: Fenster erscheint, Backend wird gestartet (`SYD_READY`, Token) und nach Beenden der Huelle ueber `--parent-pid` wieder beendet.
- Gefundene und behobene Fehler beim Gesamttest: `/api/shutdown` war vor Einrichtung gesperrt (423); Backend beendete sich nach dem Beenden nicht, solange eine Oberflaeche per WebSocket verbunden war (jetzt Trennung erkannt und `timeout_graceful_shutdown=5`); Abfrage-Schluessel kollidierten zwischen Ansichten (Absturz in Dokumente); die CSP blockierte inline eingebettete Schriften.

**Nicht geprueft (braucht Windows 11):** gebauter NSIS-Installer und PyInstaller-Dienst, Tray, Autostart, Einzelinstanz, Windows-Benachrichtigungen, DPAPI, Firewall-Regel, Empfang mit der echten LocalSend-App, SmartScreen, Neuinstallation ueber laufende Version (siehe PLAN.md Abschnitt 10). S3 und S4 sind offen: das Gold-Set ist synthetisch (alle Felder 100 %), echte Fotos werden schlechter erkannt. Die LocalSend-Quarantaene liegt bis zur Bestaetigung unverschluesselt unter `staging/localsend`.

## Arbeitsannahmen fuer die offenen Fragen (PLAN.md Abschnitt 8)

Ohne Rueckmeldung von Nils wurde jeweils die Empfehlung aus dem Plan angenommen: Original unveraendert (Option B), Kontrastkorrekturen uebernommen, 16 px Grundschrift mit Einstellung, keine Hell-Variante. Aenderbar ohne grossen Aufwand.

## Entwickeln

```
cd backend
python -m venv .venv && .venv/bin/pip install -e . pytest ruff   # Windows: .venv\Scripts\
.venv/bin/python -m pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

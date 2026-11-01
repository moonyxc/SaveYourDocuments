# PLAN: Save Your Documents

Stand: 2026-11-01 | Version 7 | Status: M1 bis M7 und die Windows-unabhaengigen Teile von M8 umgesetzt und unter Linux getestet (Backend, Oberflaeche, Rust-Huelle uebersetzt). Offen: Abnahme auf Windows 11 (S1, Installer, Tray/Autostart, DPAPI, Firewall, echte LocalSend-App), S3 mit echten Dokumenten, S4, Code-Signing

## 1. Ziel

Ein lokales Programm, das dauerhaft im Hintergrund laeuft, Fotos/Scans wichtiger Dokumente (Versicherung, Kauf, Behoerden usw.) entgegennimmt, **selbst erkennt**, was es ist (Art, Bereich, Firma, Datum, Betrag, Fristen), den Nutzer das Ergebnis **validieren** laesst und alles durchsuchbar, filterbar, nachvollziehbar und mit Erinnerungen speichert.

### Muss

- **Eingang:** Datei-Upload per Dialog/Drag and Drop und Handyfotos ueber das LocalSend-Protokoll. Kein E-Mail-Eingang, kein ueberwachter Ordner.
- Erkennung von Art, Bereich, Firma, Datum, Betrag und Fristen
- Validierungsschritt: Nutzer bestaetigt oder aendert das Ergebnis
- Neue Firma erkannt -> Rueckfrage, ob neuer Eintrag/Ordner angelegt wird
- Mehrseitige Dokumente: **Nutzer waehlt beim Import, welche Fotos zusammengehoeren**
- Verknuepfung zusammengehoeriger Dokumente: **Programm schlaegt vor** (gleiche Firma, Bezug auf Aktenzeichen), Nutzer bestaetigt
- Vollstaendige Logs, pro Tag eine Datei
- Metadaten speichern und durchsuchen, Metadaten im Anzeigenamen ein/aus
- Suche, Filter, Tags
- Status bezahlt / nicht bezahlt
- **Erinnerungen:** Zahlungsfristen und Kuendigungs-/Vertragsfristen. Standard-Vorlauf: Zahlung 7 und 1 Tag vorher, Kuendigung 30 und 7 Tage vorher, pro Dokument aenderbar. Sich wiederholende Fristen (z.B. jaehrliche Vertragsverlaengerung) entstehen automatisch neu
- **Auswertungen:** Summen pro Firma, Jahr, Bereich. Nur Euro. Darstellung als Tabelle und Diagramme in der Oberflaeche, Schwerpunkt auf schoenem UI (Nils: "halb, auch"). CSV-Export nur als Nebenfunktion
- **Ordner:** intern frei organisiert, **Export in echte Ordnerstruktur ueber frei konfigurierbare Vorlage**
- **Nie loeschen, nur archivieren**
- **Alles in einer verschluesselten Datei**, Groesse egal. Die Datei ist als Ganzes kopierbar (USB-Stick nur optional, einfach bei der einen Datei bleiben, siehe 3.2). Passwortschutz nur optional vom Nutzer aktivierbar
- **Schoenes, benutzerfreundliches UI** (Nils: wichtig, auch fuer Laien), komplett auf Deutsch (siehe 4.8)
- **Strikt lokal**, kein Cloud-LLM, nur Windows 11, nur Deutsch (Oberflaeche und Dokumente)
- **Autostart mit Windows, laeuft im Tray, empfaengt immer und erinnert**

### Nicht-Ziele (vorerst)

- Mehrbenutzer, Cloud-Sync, eigene Mobile-App (Handy nutzt die LocalSend-App)
- E-Mail-Import, ueberwachter Scanner-Ordner
- Steuerberechnung (nur Erfassung von Betraegen)

### Zielgruppe

Privat, zunaechst Nils, Familie und Freunde. Jeder hat eine eigene Installation mit eigenen Daten (kein gemeinsames Konto, kein Server, keine Mehrbenutzer an einem PC). Nur Windows 11, nur Deutsch. Konsequenzen: Installer und Updates muessen fuer Nicht-Entwickler funktionieren (M8), der Wiederherstellungsschluessel ist Pflicht, die Hardware der Nutzer ist unbekannt (siehe D5).

## 2. Vorhandene Loesungen (nicht neu erfinden)

| Loesung | Deckt ab | Luecken fuer dieses Projekt |
|---|---|---|
| Paperless-ngx | OCR, Volltextsuche, ML-Klassifikation, Workflows, REST-API, Custom Fields | Keine Einzeldatei-Ablage, kein echter Validierungsdialog, Betragsextraktion nicht nativ. Dokumentverknuepfung und Tageslogs nicht verifiziert |
| finamt (PyPI) | Lokale Pipeline Python + FastAPI + React, OCR, Ollama-Extraktion fuer deutsche Belege, SQLite, Web-UI zum Pruefen | Fokus auf Steuerbelege |
| LocalSend-Protokoll | Offenes REST-Protokoll fuer Datei-Empfang im lokalen Netz, mehrere unabhaengige Implementierungen (Rust, Go) | Nur Transport, keine Dokumentlogik |

**Entscheidung:** Eigenbau wie gewuenscht. Paperless-ngx als Referenz fuer Datenmodell/Workflows, finamt als Referenz fuer die lokale Extraktion. LocalSend wird **nicht als App eingebaut**, sondern als Protokoll implementiert (siehe D7).

## 3. Entscheidungen

| ID | Entscheidung | Status |
|---|---|---|
| D1 | Backend: Python + FastAPI | Gesetzt |
| D2 | Shell: Tauri 2 mit Python-Sidecar (PyInstaller), Tray, Autostart, Einzelinstanz. Fallback: Electron, Backend bleibt identisch | Offen bis Spike S1 besteht |
| D3 | Speicher: alles in einer verschluesselten SQLite/SQLCipher-Datei (Metadaten, FTS5, Dokumentinhalte als BLOBs), Datei darf gross werden | Gesetzt, unter Linux bestaetigt (docs/SPIKES.md), Windows-Messung offen |
| D4 | Verschluesselung at rest: SQLCipher. Standard: zufaelliger Schluessel, an das Windows-Konto gebunden, keine Eingabe beim Start. Passwort nur optional (Umschluesselung per Einstellung). Wiederherstellungsschluessel Pflicht | Gesetzt (Nils), Technik offen bis Spike S2 |
| D5 | Erkennung strikt lokal (kein Cloud-LLM). Zwei Stufen: OCR + Regeln als Basis, lokales Modell (z.B. via Ollama) zuschaltbar mit Mindestanforderung. Provider-Schnittstelle bleibt austauschbar | Offen bis Spike S3 |
| D6 | Frontend: React + TypeScript + Vite + Tailwind CSS mit den Tokens aus DESIGN.md | Gesetzt |
| D7 | Handy-Eingang: LocalSend-Protokoll v2 als Empfaenger **in Python selbst implementieren**. Alternative: fertiges Go-CLI als zweiter Sidecar | Eigenimplementierung steht (backend/syd/localsend.py), Test mit echter LocalSend-App und Windows-Firewall offen |
| D8 | Loeschkonzept: kein Loeschen im Programm, nur Status `archiviert` (ausgeblendet, wiederherstellbar) | Gesetzt, Randfaelle siehe 7 |
| D9 | Hintergrundbetrieb: Prozess lebt mit dem Tray, Fenster schliessen beendet nicht, Beenden nur ueber Tray-Menue | Gesetzt, Umsetzung in S1 pruefen |
| D10 | Log nur mit IDs und Ereignistypen, keine Inhalte. Alt/Neu-Werte von Korrekturen liegen in der verschluesselten Datenbank (Feldhistorie), nicht im Log | Gesetzt (Nils bestaetigt, 4.7) |
| D11 | UI: DESIGN.md von Nils (dunkles BI-Designsystem) als Grundlage, Anpassungen laut 4.8.1, Klickprototyp vor der Umsetzung (M0b) | Gesetzt, Prototyp liegt in prototype/index.html, Abnahme durch Nils offen |

### 3.1 D3: Alles in einer Datei

Entscheidung Nils: alles in einer Datei, Groesse egal. Randbedingungen:

- Laut SQLite-Dokumentation (Test von 2011, ausdruecklicher Hinweis: auf Zielhardware nachmessen) sind BLOBs unter ca. 100 KB in der Datenbank schneller zu lesen, darueber aus separaten Dateien. Handyfotos und PDFs liegen meist darueber. Erwarteter Unterschied klein, wird in S2 gemessen.
- Dokumentinhalte in eigener Tabelle, getrennt von den Metadaten, damit Listen und Suche schnell bleiben. Vorschaubilder in eigener kleiner Tabelle.
- Stueckweiser Zugriff (inkrementeller BLOB-I/O), kein vollstaendiges Laden in den Arbeitsspeicher. `sqlcipher3` nennt diese Funktion in seiner README, in S2 pruefen.
- Backup ueber die SQLite-Backup-Funktion, nicht durch Kopieren der laufenden Datei.
- Seitengroesse: SQLite-Dokumentation empfiehlt 8192 oder 16384 fuer grosse BLOBs, Vertraeglichkeit mit SQLCipher in S2 pruefen.
- "Nie loeschen" heisst: die Datei waechst nur, VACUUM kaum noetig. Speicherplatzanzeige und Warnung einplanen.
- Hash-Dedup (SHA-256 als Spalte) bleibt.
- Export als Ordnerstruktur/ZIP bleibt (4.6).
- Risiko: eine beschaedigte Datei bedeutet Totalverlust. Gegenmassnahmen: Integritaetspruefung beim Start, automatische rotierende Sicherungskopie, Hinweis auf externes Backup, Wiederherstellungsschluessel.

### 3.2 Schluessel, Passwort und USB (Entscheidung Nils)

Vorgaben Nils: Passwort nur optional vom Nutzer aus. USB-Stick nur optional, einfach bei der einen Datei bleiben.

**Schluessel:**
- Standard: zufaelliger Datenschluessel, an das Windows-Konto gebunden (Mechanismus, z.B. Windows-Schluesselbund/DPAPI, in S2 verifizieren). Kein Passwort beim Start, Tray-Dauerbetrieb, Handy-Empfang und Erinnerungen laufen ohne Eingabe.
- Optional: Der Nutzer aktiviert in den Einstellungen ein Passwort. Dann wird die Datei auf einen aus dem Passwort abgeleiteten Schluessel umgeschluesselt. Konsequenz, die klar angezeigt werden muss: Die App fragt beim Start nach dem Passwort, Empfang und Erinnerungen laufen erst danach.
- **Wiederherstellungsschluessel (Pflicht im Erststart-Assistenten):** Im Standardmodus ist die Datei ohne ihn auf einem anderen PC oder nach einer Windows-Neuinstallation unlesbar. Der Assistent zwingt zum Speichern (Ausdruck oder Datei), bevor es weitergeht.
- Immer nur ein aktiver Schluessel gleichzeitig (kein Mehrfach-Einpacken), das haelt das Konzept einfach.

**USB-Stick:**
- Die Datenbank ist eine normale Datei. Kopieren auf einen Stick und Oeffnen an einem anderen PC funktioniert mit Wiederherstellungsschluessel oder Passwort.
- Funktionen: "Datei sichern unter ..." (SQLite-Backup-Funktion, Ziel frei waehlbar, auch USB) und "Datei oeffnen".
- Dauerbetrieb direkt vom Stick wird nicht aktiv unterstuetzt: Verbraucher-USB-Sticks plus Abziehen im Schreibvorgang koennen eine Datenbank beschaedigen (Erfahrungsbericht im SQLite-Forum). Liegt der Datenpfad auf einem Wechseldatentraeger, zeigt die App eine Warnung. Kein Sondermodus.
- FAT32 begrenzt Dateien auf 4 GiB. Bekannt, in dieser Recherche nicht belegt, in S2 pruefen. Fuer Sicherungen auf Sticks: exFAT oder NTFS empfehlen.

## 4. Architektur

```
Tauri 2 (Rust, duenn): Tray, Autostart, Einzelinstanz, Benachrichtigungen
 |- startet Python-Sidecar auf freiem localhost-Port, beendet ihn beim Beenden
 |- React/TS-Frontend (Import-Dialog, Review-Queue, Suche, Filter, Auswertungen)
        | REST + WebSocket (Job-Fortschritt, Eingangs-Meldungen)
        v
Python-Sidecar (FastAPI + uvicorn, PyInstaller)
 |- LocalSend-Empfaenger (HTTPS, Multicast-Erkennung, Quarantaene-Eingang)
 |- Repository-Schicht (SQLCipher, FTS5)
 |- DocumentStore (BLOBs in der Datenbankdatei, Hash-Dedup)
 |- Job-Queue (OCR, Extraktion)
 |- Extraktions-Provider (Regeln + lokales Modell, austauschbar)
 |- Scheduler (Fristen, Erinnerungen, Nachholen verpasster Erinnerungen)
 |- Export-Engine (Ordnervorlage)
 |- Audit-Log (append-only, eine Datei pro Tag)
```

Das Backend laeuft auch ohne Shell im Browser (`uv run`), damit Entwicklung und Tests unabhaengig von Tauri sind.

### 4.1 Eingangskette

```
LocalSend / Upload -> Quarantaene -> Annahme/Pruefung -> Import-Stapel -> Gruppieren (Nutzer) -> OCR/Erkennung -> Validierung
```

- Eine LocalSend-Sitzung ist ein Stapel. Der Import-Dialog zeigt den Stapel mit Vorschau, der Nutzer ordnet Fotos zu Dokumenten (mehrseitig) oder sortiert aus.
- Eingehende Dateien kommen zuerst in einen Quarantaeneordner: Typpruefung (nur Bild/PDF), Groessenlimit, bereinigte Dateinamen, Annahme-Dialog, Vertrauensliste bekannter Geraete (Fingerabdruck), optional PIN.
- Die Erkennung des Protokolls ist unauthentifiziert, Alias-Faelschung im Netz ist moeglich. Daher: Annahme nur nach Bestaetigung oder fuer als vertraut markierte Geraete.

### 4.2 Hintergrundbetrieb

- Autostart mit Windows, Tray-Symbol, Fenster schliessen = in den Tray minimieren.
- Der Sidecar laeuft, solange die Tray-App laeuft. Nur dann sind Handy-Empfang und Erinnerungen aktiv.
- Erinnerungen beim Start nachholen, wenn der PC zum Faelligkeitszeitpunkt aus war.
- Einzelinstanz erzwingen (kein zweiter Sidecar auf demselben Port/Datenordner).
- Windows-Firewall: Erstkonfiguration fuer LocalSend-Port und Multicast, im Erststart-Assistenten erklaeren.

### 4.3 Dokument-Zustandsmodell

`eingegangen -> verarbeitet -> erkannt -> geprueft` sowie unabhaengig davon `archiviert` (Ja/Nein).

- Nur `geprueft` zaehlt fuer Auswertungen, Erinnerungen und Summen.
- Jede Erkennung speichert pro Feld Wert, Konfidenz und Quelle (Regex/LLM/manuell).
- Korrekturen werden als Alt/Neu im Audit-Log festgehalten.
- Archivieren ist umkehrbar und wird mit Grund protokolliert.

### 4.4 Datenmodell (Entwurf)

- `document` (id, sha256, original_name, mime, seiten, importiert_am, zustand, archiviert, archiv_grund, doc_datum, betrag, waehrung (zunaechst nur EUR), bezahlt, bezahlt_am, notiz)
- `document_page` (document_id, seite), Seiten gehoeren zu einem Dokument; `blob` (id, inhalt) und `thumbnail` (id, bild) als eigene Tabellen
- `import_batch` (id, quelle: upload/localsend, geraet, empfangen_am, status)
- `company` (id, name, aliase), `category` (Art/Bereich, hierarchisch), `tag`, `document_tag`
- `document_link` (von, nach, typ: antwort_auf / gehoert_zu / ersetzt, status: vorgeschlagen / bestaetigt / abgelehnt, grund)
- `deadline` (document_id, typ: zahlungsziel / vertragsende / kuendigungsfrist / sonstige, datum, quelle, bestaetigt, wiederholung: keine / jaehrlich / Dauer in Monaten)
- `reminder` (deadline_id, vorlauf, zustand: offen / angezeigt / erledigt / zurueckgestellt)
- `reminder_default` (fristtyp, vorlauf_tage), Standardwerte: Zahlung 7 und 1, Kuendigung 30 und 7
- `extraction` (document_id, feld, wert, konfidenz, quelle, lauf_id)
- `reference_number` (document_id, typ, wert, wert_normalisiert, quelle, bestaetigt), Typ: aktenzeichen / kundennummer / vertragsnummer / schadennummer / rechnungsnummer / geschaeftszeichen
- `field_history` (document_id, feld, alt, neu, geaendert_am, von), Alt/Neu-Werte von Korrekturen, in der verschluesselten DB
- `ocr_text` (document_id, seite, text) + FTS5-Index
- `export_template` (name, Vorlage fuer Ordner- und Dateinamen mit Platzhaltern wie Firma, Bereich, Jahr, Art)
- `display_name_setting` (Vorlage fuer Anzeigename, ein/aus)
- `trusted_device` (fingerprint, alias, vertraut_seit)
- Migrationen von Anfang an

### 4.5 Fristen und Erinnerungen

- Erkennung liefert Rohfelder (Zahlungsziel, Vertragsende, Kuendigungsfrist als Dauer oder Datum). Berechnetes Kuendigungsdatum = Vertragsende minus Frist, immer zur Bestaetigung vorgelegt.
- Erinnerungen entstehen nur aus bestaetigten Fristen.
- Standard-Vorlauf: Zahlung 7 und 1 Tag vorher, Kuendigung 30 und 7 Tage vorher. Pro Dokument aenderbar, Standardwerte in den Einstellungen aenderbar.
- Wiederkehrende Fristen: Bei bestaetigter automatischer Verlaengerung (z.B. jaehrlich) entsteht nach Ablauf automatisch die naechste Frist samt Erinnerungen. Der Nutzer kann die Wiederholung pro Vertrag beenden. Offen: Wie erkennt das Programm die Verlaengerungsklausel (Gold-Set pruefen), und wie wird eine Kuendigung festgehalten (verknuepftes Dokument vom Typ Kuendigung stoppt die Wiederholung)?
- Zustaende: offen, angezeigt, erledigt, zurueckgestellt. Bezahlt-Status schliesst Zahlungserinnerungen automatisch.
- Zustellung: Desktop-Benachrichtigung (Tray). Bei laufender App immer, sonst Nachholen beim Start.

### 4.6 Export-Engine

- Frei konfigurierbare Vorlage fuer Pfad und Dateiname (Platzhalter aus Metadaten).
- Pflichtregeln: Zeichenbereinigung fuer Windows-Dateinamen, Laengenlimit, Kollisionsbehandlung (Suffix), Umgang mit leeren Feldern (Fallback-Ordner "Unbekannt").
- Vorschau vor Export, Export ist rein lesend (Archiv bleibt unveraendert), auch archivierte Dokumente optional einschliessen.

### 4.7 Audit-Log (Entscheidung Nils: nur IDs)

- Inhalt: Ereignistyp, Zeitpunkt, IDs (Dokument, Stapel, Geraet), Feldname. **Keine Inhalte** wie Firmennamen, Betraege, OCR-Text.
- Ablage: Tabelle `audit_log` in der Datenbankdatei (Tag als Spalte, Tagesansicht und Export einer Tagesdatei moeglich). So bleibt alles in einer Datei.
- Alt/Neu-Werte von Korrekturen gehoeren in `field_history` (verschluesselte DB), nicht ins Log.
- Technische Diagnose-Logs (Abstuerze, Fehlercodes) als Tagesdatei auf der lokalen Platte, ebenfalls nur IDs und Fehlercodes, damit Support ohne Dokumentinhalte moeglich ist.
- Ereignisse: Empfang, Annahme/Ablehnung, Import, Erkennungslauf, Korrektur, Statuswechsel, Archivierung, Erinnerung, Export, Fehler.
- Dies ist mein Entwurf aus der Antwort "nur IDs" und der Vorgabe "alles in einer Datei", von Nils zu bestaetigen.

### 4.8 UI und Bedienbarkeit (Nils: schoen und benutzerfreundlich)

- Komplett Deutsch, einfache Alltagssprache statt Fachbegriffen, verstaendliche Fehlermeldungen mit naechstem Schritt.
- **Startansicht:** Was ist neu eingegangen, was muss ich pruefen, was wird bald faellig. Keine leere Tabelle.
- Import per Drag and Drop, grosse Vorschau, Stapel visuell sortieren (Fotos zu Dokumenten ziehen).
- Pruefansicht: Original gross, erkannte Felder daneben, unsichere Felder deutlich markiert, Tastaturbedienung.
- Suche immer erreichbar, Filter als anklickbare Chips, Tags mit Farben.
- Fristen und Erinnerungen uebersichtlich (Zeitleiste/Liste), Erledigen und Zurueckstellen mit einem Klick.
- Auswertungen als gut lesbare Tabellen und Diagramme.
- Hell und dunkel, ausreichender Kontrast, skalierbare Schrift, Leerzustaende mit Anleitung, Erststart-Assistent (Datei anlegen, Schluessel, Handy koppeln, Firewall).
- Designgrundlage: DESIGN.md von Nils (siehe 4.8.1). Klickprototyp in M0b.

#### 4.8.1 Pruefung von DESIGN.md (Grundlage des UI)

DESIGN.md beschreibt ein dunkles, datendichtes Business-Intelligence-Designsystem (Inter, JetBrains Mono, Blau-Akzent, Tailwind-artige Tokens, Karten, Tabellen, Sidebar). Es passt gut fuer Auswertungen und Tabellen, hat aber Punkte, die ich vor der Umsetzung klaeren will.

**Kontrast-Messung** (eigene Berechnung nach WCAG, Vorgabe in DESIGN.md: mindestens 4.5:1 fuer normalen Text):

| Kombination aus DESIGN.md | Verhaeltnis | Bewertung |
|---|---|---|
| `text-faint` auf `bg-primary` | 3.96 | unter 4.5 |
| `text-faint` auf `bg-secondary` (Karten) | 3.67 | unter 4.5 |
| `text-faint` (Platzhalter) auf `input-bg` | 3.04 | unter 4.5 |
| Weisser Text auf Primary-Button (`accent-primary`) | 3.68 | unter 4.5 |
| Weisser Text auf Danger-Button (`error`) | 3.76 | unter 4.5 |
| `accent-primary` auf `accent-muted` (aktiver Navigationspunkt) | 2.37 | unter 3.0, schwer lesbar |
| `info` auf `bg-secondary` | 4.19 | unter 4.5 |
| `accent-primary` auf `bg-tertiary` (Hover) | 3.99 | unter 4.5 |
| `text-muted` auf allen Flaechen | 5.78 bis 7.53 | in Ordnung |
| `text-secondary` und `text-primary` | ueber 9.9 | in Ordnung |

DESIGN.md verletzt damit stellenweise die eigene Barrierefreiheitsregel. Fuer Familie und Freunde (auch aeltere Nutzer) ist das relevant. Vorgeschlagene Korrekturen (Nils entscheidet): Platzhalter und Zeitstempel in `text-muted` statt `text-faint`, Primary-Button mit `accent-hover` als Grundfarbe (weiss darauf 5.17), Danger-Button dunkler, aktiver Navigationspunkt mit hellerem Text statt Blau auf Blau. Konkrete Farbwerte rechne ich im Prototyp nach.

**Weitere Punkte:**
- **Datendichte gegen Laientauglichkeit:** Fliesstext in `text-sm` (14 px) und Tabellen mit hoher Dichte sind fuer BI-Profis gedacht. Fuer Familie und Freunde schlage ich 16 px Grundschrift in den Hauptansichten vor, 14 px nur in dichten Tabellen, plus einstellbare Schriftgroesse.
- **Nur dunkles Thema:** DESIGN.md definiert nur Dunkel. Hell-Variante ist nicht geplant, solange Nils sie nicht will.
- **Schriften offline:** Die App laeuft lokal und ohne Internet. Inter und JetBrains Mono muessen mitgeliefert werden (kein CDN). Lizenzen der Schriften vor der Auslieferung pruefen (nicht verifiziert).
- **Mindestgroesse 44 px** fuer Bedienelemente ist fuer Maus am Desktop grosszuegig, bleibt aber als Prinzip fuer Touch/Touchpad sinnvoll.
- **Animation:** Keine Animation bei Datenaktualisierung, kurze Uebergaenge sonst. Passt zu "ruhig und benutzerfreundlich".
- **Statusfarben nie allein:** Die Regel "Farbe nie als einziger Indikator" gilt fuer bezahlt/unbezahlt, Konfidenz und Fristen (immer mit Symbol und Text).

### 4.9 Verknuepfungsvorschlaege (Nils: Claude entscheidet)

Kennungen, die erkannt und normalisiert gespeichert werden: Aktenzeichen, Kundennummer, Vertrags-/Versicherungsscheinnummer, Schadennummer, Rechnungsnummer, "Ihr Zeichen/Unser Zeichen". Keine Kontonummern oder IBAN als Verknuepfungsschluessel.

- Normalisierung: Leerzeichen, Bindestriche, Gross/Klein vereinheitlichen. Zunaechst nur exakter Vergleich nach Normalisierung, kein Fuzzy.
- Punktesystem: gleiche Firma + gleiche Kennung = starker Vorschlag. Gleiche Kennung ohne gleiche Firma = mittel. Gleiche Firma + Textbezug ("Ihr Schreiben vom ...", "Bezug: ...") mit passendem Datum = mittel. Nur gleiche Firma = kein Vorschlag.
- Vorschlaege erscheinen in der Pruefansicht, der Nutzer bestaetigt oder lehnt ab. Abgelehnte Paare werden gemerkt und nicht erneut vorgeschlagen.
- Typen der Verknuepfung: antwort_auf, gehoert_zu, ersetzt. Typische Ketten: Rechnung -> Mahnung -> Zahlungsbeleg, Schadenmeldung -> Schreiben -> Antwort, Vertrag -> Nachtrag -> Kuendigung.

### 4.10 Speicherbedarf und Originalformat

Dokumentmenge pro Jahr: unbekannt (Nils). Planung daher auf Obergrenze: 10.000 Dokumente muessen performant sein (M8).

Rechenbeispiel (Annahmen, nicht gemessen): Handyfotos haben oft mehrere MB je Seite, scharfe Dokumentfotos sind mit deutlich weniger gut lesbar. Bei 1.000 Dokumenten mit je 2 Seiten und je 3 MB waeren das ca. 6 GB, bei 10.000 ca. 60 GB. Wegen "nie loeschen" und "eine Datei" waechst die Datei nur. Messung mit echten Scans in S2.

Offene Funktionsentscheidung (Nils):
- **A) Original unveraendert behalten** (Beweiswert, spaetere bessere OCR). Durchsuchbarkeit ueber den OCR-Text in der Datenbank, keine zweite PDF-Version noetig. Groesster Speicherbedarf.
- **B) Original behalten, optional "Platz sparen"** als Einstellung (verkleinert/ neu komprimiert, Standard aus).
- **C) Beim Import verkleinern, Original verwerfen.** Kleinste Datei, aber das unveraenderte Original ist weg.

Meine Empfehlung: B mit Standard "Original unveraendert", weil dies "nie loeschen" respektiert und die Entscheidung spaeter zulaesst.

## 5. Spikes (Meilenstein M0, zuerst, jeweils mit Abbruchkriterium)

### S1: Tauri + PyInstaller-Sidecar + Tesseract + Tray/Autostart (Windows)

- FastAPI-Sidecar per `tauri-plugin-shell` starten, Port-Handshake, Healthcheck
- Sidecar beim Beenden sicher killen (`RunEvent::ExitRequested`, `kill()` genau einmal)
- Tesseract-Binary + `deu`-Sprachdaten mitliefern (PyInstaller kann Tesseract nicht einfrieren)
- Bekanntes Problem: NSIS-Installer ersetzt den Sidecar bei Neuinstallation gleicher Version eventuell nicht (Tauri-Issue 15134), Gegenmassnahme: Installer-Hooks, `--clean`
- `externalBin`-Pfad: Doku und Issue widersprechen sich beim Unterordner `binaries/`, am eigenen Setup verifizieren
- Capability `shell:allow-execute` mit `sidecar: true`
- **Neu:** Tray-Symbol, Fenster schliessen = Tray, Autostart, Einzelinstanz, Benachrichtigungen. Verfuegbarkeit und Verhalten der entsprechenden Tauri-2-Plugins ist **nicht verifiziert** und wird im Spike geprueft.

**Bestanden, wenn:** Installer baut, App startet mit Windows im Tray, Sidecar laeuft, OCR eines deutschen Testscans funktioniert, Beenden hinterlaesst keinen Prozess, Update ersetzt den Sidecar, zweiter Start oeffnet nur das vorhandene Fenster.
**Abbruch:** Spike scheitert oder braucht unverhaeltnismaessig Aufwand -> Electron-Fallback pruefen (D2).

### S2: SQLCipher + FTS5 in Python (Windows)

- `sqlcipher3-binary` bzw. Fork `sqlcipher3-wheels`: Windows-Wheel fuer die gewaehlte Python-Version vorhanden? (Quellen widersprechen sich)
- FTS5 in der verschluesselten DB aktiv (`PRAGMA compile_options`)
- Reihenfolge: `PRAGMA key` zuerst, ggf. `cipher_compatibility` danach
- Schluessel im OS-Schluesselbund (z.B. `keyring`), Verhalten bei Schluesselverlust dokumentieren
- PyInstaller-Einbindung der nativen Bibliothek
- **Schluessel (3.2):** zufaelliger Schluessel an das Windows-Konto binden (DPAPI/Schluesselbund) und beim Autostart ohne Eingabe oeffnen, Umschluesseln auf Passwort und zurueck (`PRAGMA rekey` o.ae.), Wiederherstellungsschluessel, jeweils im gebauten Sidecar
- **Datei kopieren (3.2):** Sicherungskopie mit der Backup-Funktion auf USB-Stick (exFAT, NTFS), Oeffnen an einem zweiten PC mit Wiederherstellungsschluessel und mit Passwort, FAT32-Dateigroessenlimit pruefen, Verhalten bei fehlender Datei (kein neues leeres Archiv anlegen)
- **BLOB-Test fuer D3:** 500 echte Scans/Fotos (3 bis 5 MB je Foto, PDFs) in die Datei schreiben, Leseverhalten, Dateigroesse, inkrementellen BLOB-I/O, Backup-Funktion und Seitengroesse 8192/16384 mit SQLCipher messen

**Bestanden, wenn:** Verschluesselte DB mit FTS5 angelegt, durchsucht, im gebauten Sidecar lauffaehig.
**Abbruch:** Kein stabiler Windows-Weg -> Dateisystem-Verschluesselung (BitLocker/Container) als dokumentierte Alternative, D4 neu.

### S3: Erkennungsqualitaet lokal vs. Cloud

- **Gold-Set:** mindestens 30 echte, anonymisierte Dokumente (Versicherung, Kaufbeleg, Behoerdenbrief, schlechte Handyfotos, mehrseitige Briefe) mit manuell bestimmten Soll-Werten, **inklusive Fristfelder** (Zahlungsziel, Vertragsende, Kuendigungsfrist)
- OCR-Varianten vergleichen (Tesseract `deu`, PaddleOCR)
- Extraktion vergleichen: Regex-Baseline, lokale Modelle (z.B. Qwen2.5 7B oder Mistral 7B via Ollama, wie in finamt). Kein Cloud-Modell
- Metriken pro Feld: Trefferquote Datum, Betrag, Firma, Art, Fristen; Laufzeit pro Dokument; Hardwarebedarf, auch auf einem schwachen PC ohne Grafikkarte (Annahme: Rechner von Familie und Freunden)
- Keine veroeffentlichten Genauigkeitswerte verifiziert, **nur eigene Messung zaehlt**

**Bestanden, wenn:** Ziel-Trefferquote vorab festgelegt (Vorschlag: Datum und Betrag >= 90 % mit Konfidenzwert, der falsche Treffer zuverlaessig zur manuellen Pruefung schickt; Fristen immer mit Bestaetigung).
**Datenschutz:** Kein Dokument verlaesst den Rechner (Entscheidung Nils). Gold-Set trotzdem anonymisiert halten, falls es geteilt wird.
**Mindestanforderung:** Zumutbare Laufzeit pro Dokument festlegen. Darunter laeuft nur die Basisstufe (OCR + Regeln) mit mehr manueller Pruefung.

### S4: OCR-Werkzeug unter Windows

- `ocrmypdf` auf Windows lauffaehig (Abhaengigkeiten wie Ghostscript) oder direkter Tesseract-Aufruf mit Vorverarbeitung (Entzerren, Kontrast)
- Handyfotos: Perspektivkorrektur noetig? (z.B. OpenCV)

### S5: LocalSend-Empfaenger

- Spezifikation lesen: https://github.com/localsend/protocol (Version festlegen, derzeit v2.x)
- Empfang mit der offiziellen LocalSend-App auf dem Handy testen: Erkennung per Multicast, Routen `register`, `info`, `prepare-upload`, `upload`, `cancel`, PIN-Parameter
- HTTPS mit selbstsigniertem Zertifikat und Fingerabdruck-Handling in Python
- Windows-Firewall-Verhalten, Multicast im Heimnetz (WLAN/Gaeste-Netz), Fallback ueber Legacy-HTTP-Erkennung
- Vergleich: Eigenimplementierung vs. Go-CLI als zweiter Sidecar (Aufwand, Lizenz, Wartung)
- Lizenz der LocalSend-App und der Referenzen pruefen, bevor Code uebernommen wird

**Bestanden, wenn:** Mehrere Fotos vom Handy kommen als ein Stapel in der Quarantaene an, Annahme/Ablehnung funktioniert, unbekannte Geraete werden nicht stillschweigend akzeptiert.
**Abbruch:** Protokoll in Python nicht stabil -> Go-CLI-Sidecar pruefen.

## 6. Meilensteine

### M0: Spikes S1 bis S5 (Abschluss: Entscheidungen D2 bis D5 und D7 dokumentiert)

### M0b: UI-Konzept und Klickprototyp

- Designsystem auf Basis DESIGN.md mit den Anpassungen aus 4.8.1, Startansicht, Import-/Gruppieransicht, Pruefansicht, Fristenansicht, Auswertungen
- Klickprototyp als HTML, von Nils abgenommen, bevor die echte UI gebaut wird

### M1: Kern

- Projektstruktur, Python-Version gepinnt (nach S1/S2), `uv`-Setup, Lint/Tests/CI
- Schema + Migrationen, Repository, DocumentStore, Hash-Dedup
- Archivierungslogik (nie loeschen), Audit-Log (Tagesdateien)

### M2: Eingang

- Datei-Upload/Drag and Drop, Quarantaene, LocalSend-Empfaenger, Vertrauensliste
- Import-Dialog mit Vorschau und Gruppierung (Nutzer waehlt zusammengehoerende Fotos)

### M3: Erkennungspipeline

- Job-Queue, OCR, Regex fuer Datum/Betrag/Fristen, Extraktions-Provider, Konfidenz je Feld
- Fortschritt per WebSocket, Tests gegen Gold-Set mit Regressions-Bericht

### M4: Validierung (Grundlage: Prototyp aus M0b)

- Review-Queue (Original links, Felder rechts, Konfidenz sichtbar), Tastaturbedienung
- Bestaetigen/aendern, Batch-Bestaetigung bei hoher Konfidenz (abschaltbar)
- Dialog "Neue Firma erkannt", Dublettenvorschlag ueber Aliase

### M5: Suche und Organisation

- Volltext (FTS5) + Filter (Firma, Art, Zeitraum, Betrag, Tag, bezahlt/offen, archiviert)
- Tags, Bezahlt-Status, Anzeigename mit Metadaten-Vorlage (ein/aus)
- Verknuepfungsvorschlaege nach 4.9 mit Bestaetigung, Anzeige beider Richtungen

### M6: Fristen, Erinnerungen, Auswertungen

- Fristenverwaltung, Scheduler, Benachrichtigungen, Nachholen verpasster Erinnerungen
- Auswertungen: Summen pro Firma, Jahr, Bereich (nur geprueft, nur Euro), Tabelle und Diagramme, CSV-Export als Nebenfunktion

### M7: Export

- Konfigurierbare Ordnervorlage, Vorschau, Kollisionsbehandlung, ZIP-Export

### M8: Auslieferung und Haertung

- Installer, Sidecar-Update (siehe S1), Backup/Wiederherstellung ("Datei sichern unter ..." und "Datei oeffnen", Ziel frei waehlbar, auch USB-Stick), Erststart-Assistent (Firewall, Wiederherstellungsschluessel als Pflicht)
- Code-Signing und SmartScreen pruefen, Anleitung fuer Nicht-Entwickler
- Fehlerfaelle: kaputte Scans, leere OCR, LLM nicht erreichbar, Abbruch mitten im Import (Transaktionen, Wiederaufnahme)
- Performance bei 10.000+ Dokumenten
- Sicherheitsreview: Sidecar nur 127.0.0.1, zufaelliges Token zwischen Shell und Backend, keine unnoetigen Tauri-Rechte, LocalSend-Port nur im lokalen Netz

## 7. Risiken und Randfaelle

| Risiko | Auswirkung | Gegenmassnahme |
|---|---|---|
| Python-Sidecar in Tauri instabil (Berichte gemischt) | Shell-Wechsel noetig | S1 zuerst, Backend shell-unabhaengig |
| Falsche Betraege/Daten/Fristen unbemerkt gespeichert | Falsche Auswertungen, verpasste Kuendigung | Zustand `geprueft`, Konfidenz, Fristen immer bestaetigen |
| SQLCipher unter Windows schwierig | Keine Verschluesselung | S2, Fallback Dateisystem-Verschluesselung |
| Lokale Modelle zu ungenau oder zu langsam | Mehr manuelle Pruefung | S3 mit Gold-Set, Basisstufe + manuelle Validierung, Cloud ausgeschlossen |
| Schluesselverlust | Datenverlust | Wiederherstellungsschluessel exportierbar, Doku |
| Dauerbetrieb: PC aus, App beendet | Keine Erinnerung, kein Empfang | Nachholen beim Start, Hinweis in der UI, Status im Tray |
| LocalSend-Port offen im Netz | Fremde Geraete senden Dateien | Quarantaene, Annahme-Dialog, Vertrauensliste, PIN, Typ-/Groessenlimit |
| "Nie loeschen": Fehlimporte, Testdaten, Dubletten bleiben | Archiv verschmutzt, Speicher waechst | Hash-Dedup, `archiviert` mit Grund, Entwicklungsmodus mit eigener Test-Datenbank |
| Datenschutz bei Weitergabe an Familie/Freunde | Fremde Daten, wenn jemand Support braucht | Keine Telemetrie, kein Upload, Support nur mit Logs ohne Inhalte |
| Unbekannte Hardware bei Familie/Freunden | Lokales Modell zu langsam | Zwei Stufen (Basis ohne Modell), Mindestanforderung, Messung in S3 |
| Eine Datei beschaedigt oder verloren | Alle Dokumente weg | Integritaetspruefung, rotierende Sicherungskopien, Backup-Hinweis, Wiederherstellungsschluessel |
| Windows SmartScreen bei unsigniertem Installer (nicht verifiziert) | Freunde brechen die Installation ab | In M8 pruefen: Code-Signing, Anleitung |
| Nutzer legt die Datenbank auf einen USB-Stick und betreibt sie dort | Beschaedigte Datenbank, Totalverlust | Warnhinweis bei Wechseldatentraeger, Integritaetspruefung beim Start, rotierende lokale Sicherung, Stick nur fuer Kopien |
| Schluessel an Windows-Konto gebunden: Windows-Neuinstallation oder anderer PC | Datei ohne Wiederherstellungsschluessel unlesbar | Wiederherstellungsschluessel Pflicht im Erststart-Assistenten, Passwort optional fuer portablen Betrieb |
| UI-Aufwand unterschaetzt (hoher Anspruch) | Projekt zieht sich, UI bleibt unfertig | Klickprototyp M0b, Designsystem, UI frueh mit Testnutzern (Familie) pruefen |
| Speicherbedarf unterschaetzt (Handyfotos unveraendert, nie loeschen, eine Datei) | Datei waechst auf zweistellige GB, Backups dauern lange | Entscheidung Originalformat (4.10), Speicherplatzanzeige, Warnung |
| Scope Creep | Projekt wird nie fertig | Nicht-Ziele einhalten, Meilensteine mit Abnahmekriterien |

## 8. Offene Fragen an Nils

Beantwortet: Eingangswege, Zusatzfunktionen, Ordner-Export, Handy-Weg (LocalSend), Mehrseiter, Verknuepfung, Hintergrundbetrieb, Export-Vorlage, Loeschen, Zielgruppe, Speicher (eine Datei), Cloud (nein), Plattform (Windows 11), Erinnerungen, Wiederholung, Waehrung (Euro), Log (nur IDs, bestaetigt), Sprache (nur Deutsch), Mehrbenutzer (nein), Kennungen (Claude entscheidet), Schluessel (Standard ohne Passwort, Passwort optional), USB (optional, einfach bei einer Datei), UI-Grundlage (DESIGN.md), Dokumentmenge (unbekannt).

Noch offen (Arbeitsannahme bis zur Antwort von Nils: jeweils die Empfehlung, Prototyp und Backend richten sich danach):

1. **Originalformat (4.10):** unveraendert, mit optionalem "Platz sparen" (Empfehlung), oder verkleinern?
2. **Kontrastkorrekturen an DESIGN.md (4.8.1):** Werte anpassen, damit die eigene Regel von 4.5:1 eingehalten wird, oder DESIGN.md unveraendert?
3. **Schriftgroesse:** 14 px laut DESIGN.md, oder 16 px Grundschrift mit einstellbarer Groesse?
4. **Hell-Variante:** Nicht geplant. Soll sie spaeter dazukommen?
5. **Aktion fuer Nils:** Fuer das Gold-Set (S3) 30 echte Dokumente sammeln und anonymisieren, inklusive schlechter Handyfotos und mehrseitiger Briefe.

## 9. Quellen (Recherche 2026-10-28, teils Sekundaerquellen)

- Paperless-ngx: https://dev.to/0012303/paperless-ngx-has-a-free-document-management-system-e87 und https://blog.elest.io/inside-paperless-ngx-how-ocr-tagging-actually-works-when-you-drop-a-pdf/
- Tauri-Sidecar (Lifecycle, Capabilities): https://stuffbucket.github.io/skills/catalog/tauri-sidecar/
- Tauri NSIS-Sidecar-Problem: https://github.com/tauri-apps/tauri/issues/15134
- Tauri + PyInstaller + Tesseract: https://github.com/evi-assistant/evi-ai/wiki/desktop-bundling
- Beispielprojekt Tauri + Python-Sidecar: https://github.com/PavanB9/gesture-guard
- sqlcipher3: https://github.com/coleifer/sqlcipher3 und https://github.com/laggykiller/sqlcipher3
- SQLCipher + FTS5 in Anwendung: https://pypi.org/project/memotether/
- finamt: https://pypi.org/project/finamt/
- SQLite Internal Versus External BLOBs: https://sqlite.org/intern-v-extern-blob.html
- SQLite auf USB-Medien (Forum, Erfahrungsbericht): https://sqlite.org/forum/forumpost/1d6752587a
- LocalSend-Protokoll: https://github.com/localsend/protocol
- Unabhaengige LocalSend-Implementierungen: https://pkg.go.dev/github.com/zebroc/localsend-cli (Go), https://docs.rs/crate/rightkit-send/0.2.0/source/src/proto.rs (Rust), https://www.github.com/Horizontal-org/Tella-Desktop (Go/Wails)

## 10. Naechster Schritt

**Umgesetzt (Stand 2026-11-01):** M0b bis M7 sowie in M8 Backup/Wiederherstellung, Erststart-Assistent, Anleitung (docs/ANLEITUNG.md), Installer-Skripte, CI, Versionsanzeige und Update-Pruefung ueber die GitHub-API (nur Hinweis, kein Download; automatische Pruefung standardmaessig aus). Offene Aufgaben: TODO.md. Details: README.md, docs/SPIKES.md, docs/ENTWICKLUNG.md. Getestet unter Linux: 87 Backend-Tests mit echter Verschluesselung und echter OCR, Ende-zu-Ende-Lauf der Oberflaeche im Browser (Einrichtung, Import, Erkennung, Pruefen, Dokumente, Fristen, Auswertung, Export, Einstellungen), `cargo check` und ein Start der Huelle unter Xvfb samt Backend-Start und -Aufraeumen.

**Offen, nur auf Windows 11 moeglich:**

1. `scripts/build-windows.ps1` laufen lassen (PyInstaller-Build, NSIS-Installer) und den Rauchtest `scripts/smoke-backend.py` gegen die gebaute Exe pruefen (S1).
2. Tray, Autostart (`--minimized`), Einzelinstanz, Windows-Benachrichtigungen, Neuinstallation ueber eine laufende Version.
3. DPAPI-Schluesseldatei, Firewall-Regel per `netsh` (UAC), Empfang mit der echten LocalSend-App vom Handy (S5).
4. Gold-Set mit echten, anonymisierten Dokumenten (S3) und OCR-Vergleich Tesseract/Alternativen (S4). Das Gold-Set unter `backend/scripts/goldset.py` ist synthetisch und daher optimistisch.
5. Code-Signing und SmartScreen, Performance mit 10.000+ Dokumenten.
6. Abnahme der Oberflaeche durch Nils.

# Save Your Documents

Electron + TypeScript App zum Archivieren und automatischen Erkennen wichtiger Dokumente (Fotos/Scans).

## Funktionen

- **Import von Scans/Fotos** (PNG, JPG, PDF u. a.) mit OCR (Tesseract, deutsch)
- **Automatische Erkennung**: Kategorie (Versicherung, Kauf, Vertrag, Behoerde, Rechnung, Sonstiges), Unterbereich, Datum und Betrag
- **Validierung vor dem Speichern**: alle erkannten Daten koennen korrigiert werden
- **Firmen-Erkennung**: neue Firmen werden erkannt und es wird gefragt, ob ein Ordner angelegt werden soll
- **Alles in einer Datei**: Metadaten-Datenbank als gzip-komprimierte JSON-Datei (`saveyourdocuments.sydoc`), Dokumente als Dateien im Firmen-Ordner
- **Tages-Logs**: alle Aktionen als JSONL pro Tag unter `data/logs/YYYY-MM-DD.jsonl`
- **Metadaten**: Datum, Betrag, Tags, Notizen; an/aus im Dateinamen anzeigbar
- **Suche + Filter + Tags** (Volltext ueber Titel, OCR-Text, Firma, Tags)
- **Bezahlt-Status** vermerkbar
- **Verknuepfungen** zwischen Dokumenten (z. B. Schreiben + Antwort)
- **Developer Tools**: gesperrt, Passwort-Schutz (in den Einstellungen setzen/freischalten)

## Entwicklung

```bash
npm install
npm start
```

## Build

Interaktives Menue:

- Windows: `build.bat`
- Linux/macOS: `./build.sh`

Optionen: 1) Requirements installieren, 2) Clean, 3) Build, 4) Paketieren, 5) Alles.

Manuell:

```bash
npm run build     # TypeScript -> dist/
npm run dist      # electron-builder -> release/ (Zip + Installer)
```

## Daten-Speicherort

Alle Daten liegen im Benutzer-Datenordner der App (`userData/data`):

- `saveyourdocuments.sydoc` (komprimierte Datenbank)
- `documents/<Firma>/...` (Originaldateien)
- `logs/YYYY-MM-DD.jsonl` (Tages-Logs)

## CI/CD

- **Build**: bei jedem Commit (`.github/workflows/build.yml`), Matrix Windows/Linux/macOS
- **Release**: bei Release-Erstellung (`.github/workflows/release.yml`) wird gebaut, gezippt und Zip + Installer an das Release angehaengt

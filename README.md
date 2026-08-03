# SaveYourData

Lokale Desktop-Anwendung zum sicheren Archivieren, Erkennen, Ordnen und Wiederfinden wichtiger Dokumente.

## Überblick

SaveYourData importiert Fotos, Scans oder PDF-Dateien, liest deren Inhalt per OCR, erkennt Dokumentart, Firma, Datum, Betrag und weitere Metadaten und schlägt eine passende Ablage vor. Vor der endgültigen Archivierung bestätigt oder korrigiert der Benutzer die erkannten Angaben.

- **Lokal & offline** – keine Cloud-Abhängigkeit
- **OCR & Klassifizierung** – automatische Erkennung von Metadaten
- **Prüfworkflow** – jeder Vorschlag wird vor der Archivierung kontrolliert
- **Volltextsuche** – über OCR-Text, Metadaten, Tags und Filter
- **Verschlüsselbar** – optionales SQLCipher-Archiv
- **Audit-Log** – vollständige Protokollierung aller Aktionen

## Technologie

| Bereich | Technologie |
|---|---|
| Sprache | TypeScript 5.x (strict) |
| Runtime | Node.js 20+ |
| Oberfläche | Electron 28+ |
| UI | React 18 + Tailwind CSS |
| Build | Vite + electron-builder |
| Pakete | pnpm |
| Datenbank | better-sqlite3 mit FTS5 |
| OCR | tesseract.js |
| Bildverarbeitung | sharp |
| PDF | pdf.js |
| Tests | Vitest + Playwright |

## Projektstruktur

```
src/
├── main/               # Electron-Hauptprozess
│   ├── app/            # Anwendungslogik, IPC, Updates
│   └── infrastructure/ # Datenbank, OCR, Import
├── preload/            # Context-Bridge (sichere IPC)
├── renderer/           # React-UI
│   ├── components/
│   ├── pages/
│   └── assets/
└── shared/             # Plattformunabhängige Domäne
    └── domain/         # Typen, Konstanten
```

## Entwicklung

```bash
# Voraussetzungen
node -v  # >= 20
pnpm -v  # >= 8

# Installation
pnpm install

# Entwicklung (Renderer + HMR)
pnpm dev

# TypeScript-Check
pnpm typecheck

# Lint & Format
pnpm lint
pnpm format

# Tests
pnpm test

# Build
pnpm build:all
```

## Build & Release

```bash
# Windows
build.bat

# Linux/macOS
./build.sh
```

Der Build erzeugt den Installer via `electron-builder` im `release/`-Verzeichnis.

## CI/CD

GitHub Actions:

- **build.yml** – TypeScript-Check, Lint, Tests, Build bei Push/PR
- **release.yml** – Release-Builds für Windows, macOS, Linux bei GitHub Release
- **issue-triage.yml** – Automatische Issue-Klassifizierung, Label-Zuweisung und Branch-Erstellung

## Lizenz

MIT – siehe [LICENSE](./LICENSE)

## Mitwirken

Features und Bugs über [GitHub Issues](https://github.com/vynofc/SaveYourDocuments/issues) einreichen. Issue-Vorlagen für Bug Reports und Feature Requests sind vorhanden.
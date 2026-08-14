# Entwickler-Dokumentation

## Architektur

### Prozesse

- **Main Process**: Node.js/Electron Main, verantwortlich für Dateisystem, Datenbank, OCR
- **Renderer Process**: React-App, UI-Darstellung
- **Preload Script**: Sichere Brücke zwischen Main und Renderer via contextBridge

### Sicherheit

- **Datenbank**: AES-256-CBC via better-sqlite3-multiple-ciphers
- **Dateien**: AES-256-GCM via Node crypto
- **Schlüsselableitung**: scrypt mit unverschlüsseltem Salt (salt.bin)
- **Passwort**: Kein Reset möglich, kein Cloud-Sync

### OCR-Pipeline

1. **Tesseract.js** (primär): Schnelle Texterkennung
2. **Vision-Modell** (Fallback): Bei Konfidenz < 70 oder fehlendem Datum/Betrag
3. **Analyse**: Regex-basierte Extraktion von Datum, Betrag, Kategorie

## Entwicklung

### Setup

```bash
# Dependencies installieren
npm ci

# Entwicklung starten
npm run dev

# Electron starten (separates Terminal)
npm run electron:dev
```

### Tests

```bash
# Unit Tests
npm run test

# E2E Tests
npm run test:e2e

# Type Check
npm run typecheck

# Lint
npm run lint
```

### Build

```bash
# Production Build
npm run build

# Electron Installer
npm run electron:build

# Plattform-spezifisch
npm run electron:build:win
npm run electron:build:linux
npm run electron:build:mac
```

## Projektstruktur

```
electron/           # Main Process
├── main.ts         # Entry Point
├── preload.ts      # contextBridge API
├── ipc/            # IPC Handler
├── services/       # Business Logic
│   ├── database.ts
│   ├── fileStorage.ts
│   ├── ocrEngine.ts
│   └── logger.ts
└── utils/          # Hilfsfunktionen

src/                # Renderer Process (React)
├── main.tsx        # React Entry
├── App.tsx         # Root Component
├── components/     # UI Komponenten
├── pages/          # Route-basierte Seiten
├── hooks/          # Custom Hooks
├── stores/         # Zustand Stores
├── types/          # TypeScript Interfaces
└── utils/          # Hilfsfunktionen
```

## IPC Channels

| Channel | Beschreibung |
|---------|-------------|
| `app:unlock` | Master-Passwort prüfen |
| `app:lock` | App sperren |
| `app:isUnlocked` | Sperrstatus abfragen |
| `dialog:openFile` | Datei-Dialog öffnen |
| `file:save` | Datei speichern (verschlüsselt) |
| `file:load` | Datei laden (entschlüsselt) |
| `file:delete` | Datei löschen |
| `ocr:process` | OCR starten |
| `ocr:progress` | OCR-Fortschritt |
| `ocr:visionStatus` | Vision-Modell Status |
| `model:download` | Vision-Modell herunterladen |
| `model:downloadProgress` | Download-Fortschritt |
| `model:checkExists` | Modell-Existenz prüfen |
| `db:query` | SQL ausführen |
| `db:documents:list` | Dokumente laden |
| `db:documents:get` | Einzelnes Dokument |
| `db:documents:create` | Dokument erstellen |
| `db:documents:update` | Dokument aktualisieren |
| `db:documents:delete` | Dokument löschen |
| `db:search` | Volltextsuche |
| `settings:get` | Einstellung laden |
| `settings:set` | Einstellung speichern |
| `log:write` | Log schreiben |

## Bekannte Limitierungen

- TypeScript 7.x hat noch keine programmatische API für Linting (nutze tsc6)
- Vision-Modell benötigt 12-16 GB RAM
- Linux-Binaries benötigen glibc >= 2.36 (Electron v39+)

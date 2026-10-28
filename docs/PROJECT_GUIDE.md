# SaveYourDocuments – Projekt-Guide

## Überblick

Diese App ist eine lokale Desktop-Anwendung zum Scannen, OCR-Verarbeiten, Kategorisieren und Suchen von Dokumenten. Die Kernfunktionalität läuft lokal im Electron-Prozess mit einem eingebetteten React-Frontend und einer SQLite-basierten Datenbank.

## Verfügbare Startbefehle

```bash
npm install
npm run dev
npm run electron:dev
npm run build
npm run typecheck
npm test -- --run
```

## Erwartete Umgebung

- Node.js 20+
- npm / pnpm entsprechend der lokalen Installation
- Windows, macOS oder Linux mit Electron-Unterstützung

## Startpfad

- Frontend-Entwicklung: `npm run dev`
- Electron-Entwicklung: `npm run electron:dev`
- Produktsystem-Build: `npm run build`

## Wichtige Fixpunkte

- In [scripts/dev.js](../scripts/dev.js) wurde der Startpfad für Vite und Electron auf die lokalen Binärdateien mit Windows-kompatibler Prozessausführung angepasst.
- In [vite.config.ts](../vite.config.ts) wurde der Vite-Server explizit auf `127.0.0.1` gebunden, damit die Port-Prüfung auf Windows zuverlässig funktioniert.
- In [electron/ipc/index.ts](../electron/ipc/index.ts) wurde der OCR-Pfad korrekt aufgelöst, sodass Dateien aus dem Dateisystem sauber verarbeitet werden.
- In [package.json](../package.json) wurde die TypeScript-Version auf eine mit dem installierten ESLint-Stack kompatible Variante festgelegt.

## Verifiziert

Für das aktuelle Projekt wurden folgende Prüfungen erfolgreich ausgeführt:

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`

Die Tests bestanden mit 48/48 erfolgreichen Testfällen, und der Produktions-Build wurde erfolgreich erstellt.

## Hinweis zum Electron-Dev-Start

Auf Windows kann der Electron-Dev-Start je nach Umgebung Warnungen zum Chromium-Cache anzeigen. Das ist in der Regel nicht funktional kritisch und stellt keinen App-Fehler dar, solange die Anwendung startet und der Dev-Server erreichbar bleibt.

## Projektstruktur

- `src/` – React-Frontend
- `electron/` – Electron-Logik, IPC-Schnittstellen und Services
- `docs/` – Projekt- und Benutzerinformationen
- `scripts/` – Dev- und Startskripte
- `src/test/` – Vitest-Tests

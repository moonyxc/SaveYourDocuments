# Autopilot-Status & Übergabe an den nächsten Chat

Stand: 21.08.2026
Branch: `main` (letzte Commits: f64b807, e2281d3, e852802)

## Auftrag

Deep-Check des gesamten Programms (SaveYourDocuments, Electron + React + TypeScript),
Verbesserungen umsetzen und sicherstellen, dass alles funktioniert.
MCP-Server (uizze, context7) und Skills (frontend-design, agent-browser) sollen genutzt werden.

## Was bereits geprüft wurde (Ergebnis: OK)

### Verifikation (alle bestanden)
- `npm run typecheck` (tsc --noEmit): **keine Fehler**
- `npx vitest run`: **48/48 Tests bestanden** (4 Dateien: ocrEngine, fileStorage, ui, DocumentCard)
- `npm run build` (tsc main + vite build): **erfolgreich** (223 kB JS, 20 kB CSS)
- `npm run lint`: **schlägt fehl, weil ESLint nicht installiert ist** (Script existiert in package.json, aber `eslint` fehlt in devDependencies)

### Geprüfte Dateien (vollständig gelesen)
- Electron Main: `electron/main.ts`, `electron/preload.ts`, `electron/ipc/index.ts`,
  `electron/services/{database,fileStorage,ocrEngine,logger}.ts`,
  `electron/utils/{paths,validation}.ts`, `electron/types.d.ts`
- Frontend: `src/App.tsx`, `src/main.tsx`, `src/index.css`,
  alle Stores (`documentStore`, `settingsStore`, `uiStore`),
  alle Hooks (`useDocuments`, `useOcr`, `useSearch`, `useSettings`),
  alle Pages (Dashboard, Documents, Scan, Search, Settings, Developer),
  alle Components (layout, documents, search, ui, common, UnlockScreen),
  Utils (`categorizer`, `formatters`, `validators`), Types, Tests, Configs
- Config: `package.json`, `vite.config.ts`, `vitest.config.ts`,
  `tsconfig.json`, `tsconfig.main.json`, `tsconfig.renderer.json`,
  `playwright.config.ts`, `main.js`, `scripts/dev.js`, `DESIGN.md`

## Gefundene Probleme (noch NICHT behoben)

### Kritisch / funktional
1. **Kategorien/Firmen/Tags werden nie aus der DB geladen.**
   - `documentStore` hat `categories`, `companies`, `tags` + Setter, aber kein Code ruft sie auf.
   - Es gibt **keine IPC-Handler** `db:categories:list`, `db:companies:list`, `db:tags:list`
     (Tabellen existieren im Schema, `createDefaultCategories` legt 5 Kategorien an).
   - Folge: `FilterPanel` in `SearchPage.tsx` zeigt leere Dropdowns.
2. **ValidationModal hat hartkodierte Kategorien/Firmen** (`src/components/documents/ValidationModal.tsx:107-134`)
   statt die DB-Daten zu nutzen. Sollte Kategorien/Firmen aus dem Store bekommen.
3. **OCR-Pfad-Bug in ScanPage**: `processImage(filePath)` wird mit `saveResult.storedFilename`
   (relativer Pfad, z.B. `_unsortiert/2026/08/uuid.pdf`) aufgerufen
   (`src/pages/ScanPage.tsx:45-46`). Tesseract bekommt aber im Main-Prozess diesen
   relativen Pfad und die Datei ist **verschlüsselt** (AES-256-GCM). OCR auf
   verschlüsselte Datei kann nicht funktionieren. Fix-Idee: IPC `ocr:process` sollte
   `documentId` oder storedFilename akzeptieren, im Main-Prozess entschlüsseln
   (`fileStorage.loadFile`), in Temp-Datei schreiben, OCR laufen lassen, Temp löschen.
   Außerdem: PDFs kann Tesseract nicht direkt, `pdfjs-dist` ist als Dependency da,
   wird aber nirgends genutzt (PDF -> Bild rendern fehlt).
4. **OCR-Fortschritt kommt nie an**: `ocr:onProgress`/`ocr:progress` Channel existiert im
   Preload, aber der Main-Prozess sendet nie `ocr:progress`-Events (kein
   `webContents.send` in `ocr:process`). Tesseract-Logger könnte progress liefern.
5. **ESLint fehlt**: `npm run lint` ist konfiguriert, aber eslint + Plugins nicht in
   devDependencies. Entweder installieren oder Script entfernen.

### Mittel
6. **Duplikate beim Upload**: `fileHash` wird berechnet, aber nie auf Duplikate geprüft
   (Index `idx_documents_hash` existiert). Vor `createDocument` sollte geprüft werden,
   ob der Hash schon existiert.
7. **Kategorie aus OCR wird verworfen**: `ocrEngine.detectCategory()` wird im Main-Prozess
   aufgerufen, aber das Ergebnis nicht im `OcrResult` zurückgegeben. Im Frontend gibt es
   ein zweites, leicht abweichendes Regelwerk (`src/utils/categorizer.ts`). Doppelte
   Logik konsolidieren (am besten Kategorie im Main bestimmen und mitschicken).
8. **DocumentDetail ohne Bearbeiten**: `onUpdate`-Prop existiert im Interface, wird aber
   nie genutzt/übergeben. Kein Editieren von Datum/Betrag/Kategorie nach dem Scan.
9. **DeveloperPage-Buttons ohne Funktion**: "Logs anzeigen", "Datenbank-Status",
   "Cache leeren" haben keine onClick-Handler (`src/pages/DeveloperPage.tsx:56-65`).
10. **TagManager ungenutzt**: Komponente existiert, wird aber auf keiner Page gerendert.
11. **LinkDocumentsModal ungenutzt**: Komponente existiert, `document_links`-Tabelle
    existiert, aber keine IPC-Handler für Links und kein UI-Einstiegspunkt.
12. **Backup-Einstellungen wirkungslos**: `backupEnabled`/`backupInterval` in Settings,
    aber kein Backup-Service im Main-Prozess (`backupsDir` wird nur angelegt).
13. **Settings `storagePath` wirkungslos**: wird nie gelesen; Pfade kommen aus `getAppPaths()`.

### Kleinigkeiten
14. `App.tsx` deklariert `window.api` global; besser wäre eine zentrale
    `src/types/api.d.ts`, damit Preload-Interface und Renderer nicht auseinanderlaufen.
15. `DashboardPage` lädt Dokumente direkt statt über `useDocuments` (doppelte Logik,
    inkonsistente Fehlerbehandlung).
16. `formatDate(document.documentDate)` zeigt `-` wenn nur `detectedDate` gesetzt ist
    (Fallback fehlt).
17. E2E-Tests (`e2e/e2e.spec.ts`) wurden nicht ausgeführt (brauchen laufenden Vite-Server;
    Playwright startet ihn selbst via webServer, aber nicht verifiziert).
18. `Toast` in DocumentsPage/ScanPage: mehrere Uploads überschreiben sich gegenseitig
    (nur ein Toast-State). Queue/Sammel-Toast wäre besser.
19. `npm run dev` startet Electron mit `main.js` -> `dist-electron/main.js`; dafür muss
    vorher `tsc -p tsconfig.main.json` gelaufen sein. `scripts/dev.js` prüft das nicht
    (Fehler nur als Electron-Dialog). Hinweis in Doku oder Prebuild-Step wäre gut.

## Sicherheits-Review (positiv, keine Änderung nötig)
- Path-Traversal-Schutz in `resolveSafePath` korrekt.
- SQL durchgehend parametrisiert, FTS-Query-Tokens escaped.
- AES-256-GCM mit zufälligem IV, AuthTag geprüft, Key-Wipe bei Lock.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  Navigation/Window-Open eingeschränkt.
- Passwort: scrypt + timingSafeEqual, Salt/Hash mit Mode 0o600.

## Geplanter Fix-Reihenfolge für den nächsten Chat
1. IPC-Handler `db:categories:list`, `db:companies:list`, `db:tags:list` (+ create für
   Firmen/Tags) in `electron/ipc/index.ts` ergänzen; Preload + `window.api`-Typen
   erweitern; `useDocuments` lädt sie in den Store.
2. OCR-Pipeline reparieren: `ocr:process` entschlüsselt storedFilename intern,
   Temp-Datei, Tesseract, Progress-Events senden; PDF-Support via `pdfjs-dist`
   (erste Seite rendern -> sharp -> PNG -> OCR).
3. `ValidationModal` und `FilterPanel` auf echte Store-Daten umstellen (hartkodierte
   Optionen entfernen).
4. Duplikat-Check per `fileHash` vor dem Anlegen (IPC `db:documents:findByHash`).
5. Kategorie-Erkennung konsolidieren (Main-Prozess liefert `detectedCategory` im
   OcrResult; `categorizer.ts` im Frontend nur noch für Vorschläge nutzen oder ganz
   entfernen).
6. ESLint-Setup vervollständigen oder Script aus package.json entfernen.
7. Danach: `npm run typecheck && npx vitest run && npm run build` müssen grün bleiben.
8. Optional: UI-Review via agent-browser-Skill (Screenshot vom laufenden Vite-Dev-Server)
   und uizze review_ui; context7 für tesseract.js/pdfjs-dist API-Details.

## Hinweise für den nächsten Chat
- Windows-Umgebung: `head`, `grep` etc. fehlen in bash -> die Grep/Glob/View-Tools nutzen.
- Tests laufen mit jsdom + gemocktem `window.api` (`src/test/setup.ts`).
- DESIGN.md definiert das Dark-Theme-Designsystem (Tailwind, slate/blue Palette) -
  UI-Änderungen daran orientieren.
- Nicht committen, außer der User sagt es explizit.

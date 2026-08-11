# SaveYourDocuments – Detaillierter Projektplan

## 1. Projektübersicht

**Ziel**: Desktop-App zum Scannen, Erkennen, Kategorisieren und Verwalten von Dokumenten mit OCR.

**Kernfunktionen**:
- Dokumente hochladen (Bilder, PDFs)
- OCR-Erkennung (Text, Datum, Betrag, Firma)
- Automatische Kategorisierung
- Validierung durch User
- SQLite-Datenbank (alles in einer Datei)
- Suche, Filter, Tags
- Verknüpfung von Dokumenten
- Bezahlt-Status tracking
- Logging pro Tag
- Developer Tools (Passwort-geschützt)

---

## 2. Technologie-Stack

| Bereich | Technologie | Version | Zweck |
|---------|-------------|---------|-------|
| Runtime | Electron | 28.x | Desktop-App Framework |
| Sprache | TypeScript | 7.x | Typsicherheit (Go-Port, 8-12x schnellere Builds) |
| UI Framework | React | 18.x | Komponentenbasierte UI |
| Styling | Tailwind CSS | 3.x | Utility-First CSS |
| OCR | tesseract.js | 5.x | Primäre Texterkennung (Main-Prozess) |
| OCR-Fallback | node-llama-cpp + GGUF-Modell | 3.x | Vision-basierte OCR bei niedriger Konfidenz (Main-Prozess) |
| Bildverarbeitung | sharp | 0.33.x | Resize, Normalize, Enhance |
| Datenbank | better-sqlite3-multiple-ciphers | 13.x | Verschlüsselte SQLite (AES-256-CBC) |
| PDF-Handling | pdfjs-dist | 4.x | PDF zu Bild für OCR |
| State Management | Zustand | 4.x | Leichtgewichtiger State |
| Routing | react-router-dom | 6.x | Navigation |
| Logging | electron-log | 5.x | Main + Renderer Logs |
| Packaging | electron-builder | 24.x | Windows Installer, Linux AppImage, macOS DMG (mit asarUnpack für native Module) |
| Testing | Vitest + Testing Library | - | Unit + Component Tests |

---

## 3. Projektstruktur

```
saveyourdocuments/
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── electron-builder.yml
├── .env.example
├── .gitignore
├── build.sh                     # Build-Skript (Linux/Mac)
├── build.bat                    # Build-Skript (Windows)
├── ir.sh                        # Install Requirements (Linux/Mac)
├── ir.bat                       # Install Requirements (Windows)
│
├── .github/
│   └── workflows/
│       ├── build.yml            # Build bei jedem Commit
│       └── release.yml          # Release mit ZIP + Installer
│
├── electron/                    # Main Process (Node.js)
│   ├── main.ts                  # Entry Point
│   ├── preload.ts               # Bridge Main <-> Renderer
│   ├── ipc/                     # IPC Handler
│   │   ├── database.ts
│   │   ├── fileSystem.ts
│   │   ├── ocr.ts
│   │   └── settings.ts
│   ├── services/
│   │   ├── database.ts          # SQLite Setup + Queries
│   │   ├── fileStorage.ts       # Dateien speichern/laden
│   │   ├── logger.ts            # Tägliche Log-Dateien
│   │   └── ocrEngine.ts         # Tesseract Worker Pool
│   └── utils/
│       ├── paths.ts             # App-Pfade (userData, logs, etc.)
│       └── validation.ts        # Input-Validierung
│
├── src/                         # Renderer Process (React)
│   ├── main.tsx                 # React Entry
│   ├── App.tsx                  # Root Component + Routing
│   ├── index.css                # Tailwind + Global Styles
│   │
│   ├── components/              # Wiederverwendbare UI
│   │   ├── ui/                  # Basis-Komponenten (Button, Input, etc.)
│   │   ├── layout/              # Header, Sidebar, MainLayout
│   │   ├── documents/           # Dokument-spezifisch
│   │   │   ├── DocumentCard.tsx
│   │   │   ├── DocumentGrid.tsx
│   │   │   ├── DocumentDetail.tsx
│   │   │   ├── DocumentUpload.tsx
│   │   │   ├── ValidationModal.tsx
│   │   │   └── LinkDocumentsModal.tsx
│   │   ├── search/              # Suche + Filter
│   │   │   ├── SearchBar.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   └── TagManager.tsx
│   │   └── common/              # Sonstige
│   │       ├── ConfirmDialog.tsx
│   │       ├── Toast.tsx
│   │       └── LoadingSpinner.tsx
│   │
│   ├── pages/                   # Route-basierte Seiten
│   │   ├── DashboardPage.tsx    # Übersicht, Statistiken
│   │   ├── DocumentsPage.tsx    # Alle Dokumente
│   │   ├── ScanPage.tsx         # Upload + OCR + Validierung
│   │   ├── SearchPage.tsx       # Erweiterte Suche
│   │   ├── SettingsPage.tsx     # Einstellungen
│   │   └── DeveloperPage.tsx    # Dev Tools (Passwort)
│   │
│   ├── hooks/                   # Custom React Hooks
│   │   ├── useDocuments.ts
│   │   ├── useOcr.ts
│   │   ├── useSearch.ts
│   │   └── useSettings.ts
│   │
│   ├── stores/                  # Zustand Stores
│   │   ├── documentStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts
│   │
│   ├── types/                   # TypeScript Interfaces
│   │   ├── document.ts
│   │   ├── ocr.ts
│   │   └── settings.ts
│   │
│   └── utils/                   # Hilfsfunktionen
│       ├── formatters.ts        # Datum, Währung formatieren
│       ├── categorizer.ts       # Kategorie-Erkennung aus Text
│       └── validators.ts        # Formular-Validierung
│
├── resources/                   # Statische Assets
│   ├── icon.png
│   └── defaultCategories.json
│
├── scripts/                     # Build/Dev Scripts
│   └── dev.js                   # Electron + Vite gleichzeitig
│
└── docs/                        # Dokumentation
    ├── USER_GUIDE.md
    └── DEVELOPER.md
```

---

## 4. Datenbank-Schema (SQLite)

### Tabellen

```sql
-- Kategorien (Hauptkategorien wie Versicherung, Kauf, etc.)
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES categories(id),
    color TEXT DEFAULT '#3B82F6',
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Firmen/Ordner (für automatische Ordner-Erstellung)
CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    folder_path TEXT,           -- Relativer Pfad im Storage (slugifiziert, sanitized)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dokumente (Haupttabelle)
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,  -- Für externe Referenzen
    
    -- Datei-Info
    original_filename TEXT,
    stored_filename TEXT NOT NULL,  -- UUID-basiert
    file_hash TEXT NOT NULL,        -- SHA-256 für Duplikat-Erkennung
    file_size INTEGER,
    mime_type TEXT,
    
    -- OCR-Ergebnisse
    ocr_text TEXT,                  -- Volltext
    ocr_confidence REAL,            -- 0-100
    ocr_source TEXT DEFAULT 'tesseract',  -- 'tesseract' | 'vision_fallback'
    detected_date TEXT,             -- ISO-Format
    detected_amount REAL,           -- Betrag
    detected_currency TEXT DEFAULT 'EUR',
    
    -- Kategorisierung
    category_id INTEGER REFERENCES categories(id),
    company_id INTEGER REFERENCES companies(id),
    
    -- Metadaten
    tags TEXT,                      -- JSON-Array
    custom_metadata TEXT,           -- JSON-Objekt
    
    -- Status
    is_paid BOOLEAN DEFAULT FALSE,
    is_validated BOOLEAN DEFAULT FALSE,  -- User hat bestätigt
    validation_notes TEXT,
    
    -- Zeitstempel
    document_date DATE,             -- Datum auf dem Dokument
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dokument-Verknüpfungen (Schreiben <-> Antwort)
CREATE TABLE document_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_document_id INTEGER NOT NULL REFERENCES documents(id),
    target_document_id INTEGER NOT NULL REFERENCES documents(id),
    link_type TEXT NOT NULL,        -- 'response', 'attachment', 'related', 'reminder'
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_document_id, target_document_id, link_type)
);

-- Tags (normalisiert für bessere Suche)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6B7280'
);

CREATE TABLE document_tags (
    document_id INTEGER NOT NULL REFERENCES documents(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (document_id, tag_id)
);

-- Volltextsuche (FTS5)
CREATE VIRTUAL TABLE documents_fts USING fts5(
    uuid,
    ocr_text,
    original_filename,
    tags,
    content='documents',
    content_rowid='id'
);

-- Trigger für FTS-Synchronisation
CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, uuid, ocr_text, original_filename, tags)
    VALUES (new.id, new.uuid, new.ocr_text, new.original_filename, new.tags);
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, uuid, ocr_text, original_filename, tags)
    VALUES ('delete', old.id, old.uuid, old.ocr_text, old.original_filename, old.tags);
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, uuid, ocr_text, original_filename, tags)
    VALUES ('delete', old.id, old.uuid, old.ocr_text, old.original_filename, old.tags);
    INSERT INTO documents_fts(rowid, uuid, ocr_text, original_filename, tags)
    VALUES (new.id, new.uuid, new.ocr_text, new.original_filename, new.tags);
END;

-- Einstellungen (Key-Value)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit-Log (für Developer Tools)
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,           -- 'create', 'update', 'delete', 'ocr', 'validate'
    table_name TEXT,
    record_id INTEGER,
    old_values TEXT,                -- JSON
    new_values TEXT,                -- JSON
    user_confirmed BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indizes für Performance
CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_date ON documents(document_date);
CREATE INDEX idx_documents_paid ON documents(is_paid);
CREATE INDEX idx_documents_validated ON documents(is_validated);
CREATE INDEX idx_documents_hash ON documents(file_hash);
```

---

## 5. Dateispeicher-Struktur

```
%APPDATA%/SaveYourDocuments/     # Windows: C:\Users\{User}\AppData\Roaming\SaveYourDocuments
├── data/
│   ├── documents.db             # SQLite Datenbank (verschlüsselt)
│   ├── documents.db-wal         # Write-Ahead Log
│   └── documents.db-shm         # Shared Memory
│
├── storage/                     # Dokument-Dateien (verschlüsselt)
│   ├── _unsortiert/             # Firma noch nicht erkannt/bestätigt
│   │   └── 2024/
│   │       └── 01/
│   │           └── {uuid}.jpg
│   ├── aok/                     # Firma: AOK (slugifiziert)
│   │   └── 2024/
│   │       └── 01/
│   │           └── {uuid}.pdf
│   ├── amazon/                  # Firma: Amazon
│   │   └── 2024/
│   │       └── 02/
│   │           └── {uuid}.jpg
│   └── finanzamt-frankfurt/     # Firma: Finanzamt Frankfurt
│       └── 2024/
│           └── 01/
│               └── {uuid}.pdf
│
├── thumbnails/                  # Vorschaubilder (verschlüsselt)
│   ├── {uuid-1}_thumb.jpg
│   └── ...
│
├── logs/                        # Tägliche Log-Dateien
│   ├── 2024-01-15.log
│   ├── 2024-01-16.log
│   └── ...
│
├── backups/                     # Automatische Backups
│   └── 2024-01-15_02-00/
│       ├── documents.db
│       └── storage/
│
├── models/                      # Lokale Vision-Modelle
│   └── ocr-vision-8b.gguf       # Heruntergeladenes OCR-Modell (einmalig)
│
└── config/
    ├── settings.json            # App-Einstellungen
    └── salt.bin                 # Salt für Schlüsselableitung (unverschlüsselt, kein Geheimnis)
```

### Dateinamen-Konvention

- **Standard (aus)**: `{uuid}.{ext}` - UUID-basiert, keine Klardaten im Dateinamen
- **Optional (an)**: `{YYYY-MM-DD}_{firma}_{betrag}eur_{uuid8}.{ext}` - Metadaten im Dateinamen

### Firmen-Ordner-Sanitizing

Beim Anlegen neuer Firmen-Ordner werden die Namen slugifiziert und sanitized:

```typescript
function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\-]/g, '-')           // Nur a-z, 0-9, Bindestrich
    .replace(/-+/g, '-')                    // Mehrfache Bindestriche reduzieren
    .replace(/^-|-$/g, '')                  // Führende/trailing Bindestriche entfernen
    .replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '_$1')  // Windows-reservierte Namen
    .substring(0, 50);                      // Maximale Länge
}

// Kollisionsprüfung: Wenn zwei Firmen denselben Slug ergeben,
// wird ein numerischer Suffix angehängt (_2, _3, ...)
```

---

## 6. Kern-Workflows

### 6.1 Dokument-Upload + OCR-Workflow

```
User draggt Datei in App
        ↓
[0] Modell-Check (nur beim ersten Start):
    - Vision-Modell vorhanden in userData/models/?
    - Falls nein: Download-Dialog (ca. 6 GB, einmalig, danach offline)
    - Download mit Fortschrittsanzeige + SHA-256-Checksummen-Prüfung
    - Kein Internet / Übersprungen → App bleibt nutzbar, nur Tesseract
        ↓
[1] Datei-Validierung (Größe, Typ, Duplikat-Check via Hash)
        ↓
[2] Datei in Storage kopieren (strukturiert nach Firma/Jahr/Monat)
        ↓
[3] Thumbnail generieren (sharp)
        ↓
[4] OCR-Hybrid-Pipeline (im Main-Prozess):
    [4a] Tesseract läuft zuerst (schnell, günstig)
        ↓
    [4b] Konfidenz-Check:
         - ocr_confidence < 70 (konfigurierbar) ODER
         - Kein Datum/Betrag per Regex gefunden
         → [4c] Vision-Modell als Fallback auf demselben Bild
         → Ergebnis mit Quelle markieren: ocr_source = 'tesseract' | 'vision_fallback'
        ↓
[5] Text analysieren:
    - Datum extrahieren (Regex + NLP)
    - Betrag extrahieren (Regex für EUR-Beträge)
    - Firma erkennen (bekannte Liste + Muster)
    - Kategorie vorschlagen (Keyword-Matching)
        ↓
[6] Neue Firma? → Dialog: "Neuen Ordner anlegen?"
    - Slug wird aus Firmennamen abgeleitet (sanitized, Kollisionsprüfung)
        ↓
[7] Validierungs-Modal anzeigen:
    - Vorschaubild
    - Erkannte Daten (editierbar)
    - OCR-Quelle anzeigen (Tesseract / Vision)
    - Kategorie-Auswahl
    - Tags hinzufügen
    - [Bestätigen] oder [Überspringen]
        ↓
[8] In Datenbank speichern (inkl. ocr_source)
        ↓
[9] Log-Eintrag erstellen
        ↓
[10] UI aktualisieren (Toast: "Dokument gespeichert")
```

### 6.2 Kategorie-Erkennung (Regelbasiert + ML-optional)

```typescript
// Kategorien-Hierarchie
const CATEGORY_RULES = {
  'Versicherung': {
    keywords: ['versicherung', 'police', 'beitrag', 'schaden', 'leistung'],
    subcategories: {
      'Krankenversicherung': ['krankenkasse', 'aok', 'tk', 'barmer'],
      'Haftpflicht': ['haftpflicht', 'schadensfall'],
      'KFZ-Versicherung': ['kfz', 'auto', 'fahrzeug'],
    }
  },
  'Kauf': {
    keywords: ['rechnung', 'kauf', 'bestellung', 'quittung', 'kassenbon'],
    subcategories: {
      'Elektronik': ['amazon', 'media markt', 'saturn', 'apple'],
      'Lebensmittel': ['rewe', 'edeka', 'aldi', 'lidl'],
      'Möbel': ['ikea', 'höffner', 'xxxlutz'],
    }
  },
  'Bank': {
    keywords: ['kontoauszug', 'überweisung', 'lastschrift', 'kredit'],
    subcategories: {
      'Girokonto': ['kontoauszug', 'umsätze'],
      'Kreditkarte': ['visa', 'mastercard', 'abrechnung'],
    }
  },
  'Vertrag': {
    keywords: ['vertrag', 'kündigung', 'verlängerung', 'agb'],
  },
  'Behörde': {
    keywords: ['finanzamt', 'bürgeramt', 'rathaus', 'amt', 'behörde'],
  }
};
```

### 6.3 Datum- und Betragserkennung

```typescript
// Datums-Patterns (deutsch)
const DATE_PATTERNS = [
  /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,           // 15.01.2024
  /(\d{1,2})\.(\d{1,2})\.(\d{2})/g,            // 15.01.24
  /(\d{4})-(\d{2})-(\d{2})/g,                  // 2024-01-15
  /(\d{1,2})\.\s*(Januar|Februar|März|...)\s*(\d{4})/gi,  // 15. Januar 2024
];

// Betrags-Patterns
const AMOUNT_PATTERNS = [
  /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(€|EUR|Euro)/g,     // 1.234,56 €
  /(\d+,\d{2})\s*(€|EUR|Euro)/g,                      // 123,45 €
  /EUR\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,               // EUR 1.234,56
  /(\d+)\s*(€|EUR|Euro)/g,                            // 123 € (ganzzahlig)
];
```

### 6.4 Verschlüsselung

Die App nutzt ein Master-Passwort beim Programmstart, aus dem alle Schlüssel abgeleitet werden. Es gibt **keinen Passwort-Reset-Mechanismus** – Passwort vergessen bedeutet Daten unwiderruflich verloren.

#### Schlüsselableitung

```typescript
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// Beim allerersten Start (Onboarding):
const salt = randomBytes(16);
const dbKey = scryptSync(masterPassword, salt, 32); // 256-bit Key
// salt.bin wird UNVERSCHLÜSSELT neben der DB gespeichert (kein Geheimnis,
// muss aber lesbar sein, BEVOR die DB geöffnet werden kann)

// Bei jedem weiteren Start:
const salt = fs.readFileSync('config/salt.bin');
const dbKey = scryptSync(masterPassword, salt, 32);
```

#### Datenbank-Verschlüsselung

```typescript
import Database from 'better-sqlite3-multiple-ciphers';

const db = new Database('documents.db');
db.pragma("cipher='aes256cbc'");
db.pragma(`key='${dbKey}'`);   // Muss vor jeder anderen Query stehen
db.pragma('journal_mode = WAL');
```

#### Datei-Verschlüsselung

Die eigentlichen Dokumentdateien (Fotos/PDFs) liegen außerhalb der DB im Dateisystem und werden mit AES-256-GCM verschlüsselt:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Beim Schreiben:
const iv = randomBytes(16);
const cipher = createCipheriv('aes-256-gcm', fileKey, iv);
const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
const authTag = cipher.getAuthTag();
// Gespeichert wird: iv (16B) + authTag (16B) + encrypted data

// Beim Lesen: Entsprechend umgekehrt
```

#### Unlock-Screen

Vor dem Anzeigen der App-Inhalte erscheint ein vollflächiger Unlock-Screen. Es werden **keine Platzhalter mit Metadaten** gerendert, bevor das Passwort korrekt eingegeben wurde.

#### Onboarding-Warnung

Beim Ersteinrichtungs-Dialog erscheint ein expliziter Hinweis:

> **Wichtig**: Es gibt keinen Passwort-Reset. Bei Verlust des Passworts sind alle Daten unwiderruflich verloren. Bitte bewahre dein Passwort sicher auf.

---

## 7. UI/UX Design

### 7.1 Farbschema (Dark Mode Standard)

```css
:root {
  --bg-primary: #0f172a;        /* slate-900 */
  --bg-secondary: #1e293b;      /* slate-800 */
  --bg-tertiary: #334155;       /* slate-700 */
  --accent: #3b82f6;            /* blue-500 */
  --accent-hover: #2563eb;      /* blue-600 */
  --success: #22c55e;           /* green-500 */
  --warning: #f59e0b;           /* amber-500 */
  --error: #ef4444;             /* red-500 */
  --text-primary: #f8fafc;      /* slate-50 */
  --text-secondary: #94a3b8;    /* slate-400 */
}
```

### 7.2 Hauptansichten

#### Dashboard
- Statistik-Karten (Gesamt, Unbezahlt, Letzte 30 Tage, Kategorien)
- Schnellzugriff (Letzte Dokumente, Favoriten)
- Aktivitäts-Feed

#### Dokumente-Übersicht
- Grid/List-Ansicht (umschaltbar)
- Gruppierung (nach Datum, Kategorie, Firma)
- Sortierung (Datum, Name, Betrag)
- Bulk-Aktionen (Löschen, Tag hinzufügen, Export)

#### Scan-Seite
- Drag & Drop Zone
- Fortschritts-Anzeige (OCR läuft)
- Live-Vorschau mit erkannten Daten
- "Alles bestätigen" / "Einzeln prüfen" Modi

#### Suche
- Volltextsuche mit Highlighting
- Filter: Datum, Kategorie, Firma, Betrag, Bezahlt-Status, Tags
- Gespeicherte Suchen

#### Einstellungen
- Allgemein: Theme, Sprache, Autostart
- Speicher: Pfad ändern, Backup-Einstellungen
- OCR: Sprache, Qualität, Vorverarbeitung
- Kategorien: Verwalten, neue erstellen
- Firmen: Liste, Ordner-Pfade
- Entwickler: Logs, Datenbank, Debug-Tools

### 7.3 Komponenten-Hierarchie

```
App
├── UnlockScreen (vollflächig, vor allen anderen Inhalten)
│   ├── Passwort-Eingabe
│   ├── [Entsperren]
│   └── Hinweis: "Kein Passwort-Reset möglich"
│
├── TitleBar (custom, frameless optional)
├── Sidebar
│   ├── Logo
│   ├── Navigation (Dashboard, Dokumente, Scannen, Suche, Einstellungen)
│   └── QuickStats (unbezahlt, letzte 7 Tage)
│
├── MainContent
│   ├── Header (Seitentitel, Aktionen)
│   └── PageContent
│
└── Modals
    ├── ValidationModal
    ├── LinkDocumentsModal
    ├── ConfirmDialog
    ├── ModelDownloadDialog (Vision-Modell Download)
    └── DeveloperLogin
```

---

## 8. IPC-Kommunikation (Main <-> Renderer)

### Channels

| Channel | Richtung | Payload | Beschreibung |
|---------|----------|---------|--------------|
| `app:unlock` | Renderer→Main | `{ password }` | Master-Passwort prüfen |
| `app:lock` | Renderer→Main | - | App sperren |
| `app:isUnlocked` | Renderer→Main | - | Status abfragen |
| `dialog:openFile` | Renderer→Main | - | Datei-Dialog öffnen |
| `file:save` | Renderer→Main | `{ buffer, filename, metadata }` | Datei speichern (verschlüsselt) |
| `file:load` | Renderer→Main | `{ documentId }` | Datei laden (entschlüsselt) |
| `file:delete` | Renderer→Main | `{ documentId }` | Datei löschen |
| `ocr:process` | Renderer→Main | `{ imagePath, options }` | OCR starten (Tesseract → Vision-Fallback) |
| `ocr:progress` | Main→Renderer | `{ jobId, progress }` | Fortschritt |
| `ocr:visionStatus` | Renderer→Main | - | Prüfen ob Vision-Modell verfügbar |
| `model:download` | Renderer→Main | - | Vision-Modell herunterladen |
| `model:downloadProgress` | Main→Renderer | `{ percent, eta }` | Download-Fortschritt |
| `model:checkExists` | Renderer→Main | - | Prüfen ob Modell bereits vorhanden |
| `db:query` | Renderer→Main | `{ sql, params }` | SQL ausführen |
| `db:documents:list` | Renderer→Main | `{ filters, pagination }` | Dokumente laden |
| `db:documents:get` | Renderer→Main | `{ id }` | Einzelnes Dokument |
| `db:documents:create` | Renderer→Main | `{ document }` | Erstellen |
| `db:documents:update` | Renderer→Main | `{ id, updates }` | Aktualisieren |
| `db:documents:delete` | Renderer→Main | `{ id }` | Löschen |
| `db:search` | Renderer→Main | `{ query, filters }` | Volltextsuche |
| `settings:get` | Renderer→Main | `{ key }` | Einstellung laden |
| `settings:set` | Renderer→Main | `{ key, value }` | Einstellung speichern |
| `log:write` | Renderer→Main | `{ level, message, data }` | Log schreiben |

### Preload-Script (contextBridge)

```typescript
// Sichere API für Renderer
contextBridge.exposeInMainWorld('api', {
  // App-Sperrung
  unlock: (password) => ipcRenderer.invoke('app:unlock', password),
  lock: () => ipcRenderer.invoke('app:lock'),
  isUnlocked: () => ipcRenderer.invoke('app:isUnlocked'),

  // Dateien
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data) => ipcRenderer.invoke('file:save', data),

  // Datenbank
  documents: {
    list: (filters) => ipcRenderer.invoke('db:documents:list', filters),
    get: (id) => ipcRenderer.invoke('db:documents:get', id),
    create: (doc) => ipcRenderer.invoke('db:documents:create', doc),
    update: (id, updates) => ipcRenderer.invoke('db:documents:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('db:documents:delete', id),
  },

  // OCR (Hybrid: Tesseract + Vision-Fallback)
  ocr: {
    process: (path) => ipcRenderer.invoke('ocr:process', path),
    onProgress: (callback) => ipcRenderer.on('ocr:progress', callback),
    visionStatus: () => ipcRenderer.invoke('ocr:visionStatus'),
  },

  // Vision-Modell
  model: {
    download: () => ipcRenderer.invoke('model:download'),
    onDownloadProgress: (callback) => ipcRenderer.on('model:downloadProgress', callback),
    checkExists: () => ipcRenderer.invoke('model:checkExists'),
  },

  // Einstellungen
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  },
});
```

---

## 9. Entwicklungs-Phasen

### Phase 1: Foundation (Woche 1-2)
- [ ] Projekt-Setup (Electron, Vite, TypeScript, React)
- [ ] Ordnerstruktur anlegen
- [ ] SQLite-Schema implementieren (better-sqlite3-multiple-ciphers)
- [ ] Verschlüsselungs-Setup (scrypt, salt.bin, Unlock-Screen)
- [ ] Basis-IPC-Layer
- [ ] Logging-System (tägliche Dateien)
- [ ] Basis-Layout (Sidebar, Routing)

### Phase 2: Dokumenten-Management (Woche 2-3)
- [ ] Datei-Upload (Drag & Drop)
- [ ] Datei-Storage-System (Firma/Jahr/Monat-Struktur mit Sanitizing)
- [ ] Datei-Verschlüsselung (AES-256-GCM)
- [ ] Thumbnail-Generierung
- [ ] Dokumenten-Liste (Grid/List)
- [ ] Dokumenten-Detailansicht
- [ ] Löschen, Umbenennen

### Phase 3: OCR-Integration (Woche 3-4)
- [ ] Tesseract.js Worker-Pool (Main-Prozess)
- [ ] PDF zu Bild Konvertierung
- [ ] Bild-Vorverarbeitung (sharp)
- [ ] Text-Extraktion
- [ ] Datum-Erkennung
- [ ] Betrag-Erkennung
- [ ] Fortschritts-Anzeige
- [ ] Vision-Modell Download-Manager (einmalig, SHA-256-Prüfung)
- [ ] node-llama-cpp Integration (Main-Prozess)
- [ ] Hybrid-Pipeline: Tesseract → Vision-Fallback bei niedriger Konfidenz

### Phase 4: Kategorisierung (Woche 4-5)
- [ ] Regelbasierte Kategorie-Erkennung
- [ ] Firmen-Erkennung
- [ ] "Neue Firma" Dialog (mit Slug-Generierung + Kollisionsprüfung)
- [ ] Kategorie-Verwaltung
- [ ] Tag-System

### Phase 5: Validierung & Workflows (Woche 5-6)
- [ ] Validierungs-Modal (mit OCR-Quelle-Anzeige)
- [ ] Bulk-Validierung
- [ ] Dokument-Verknüpfungen
- [ ] Bezahlt-Status
- [ ] Suchfunktion (FTS5)
- [ ] Filter-Panel

### Phase 6: Polish & Features (Woche 6-7)
- [ ] Dashboard mit Statistiken
- [ ] Export (CSV, PDF-Report)
- [ ] Backup/Restore
- [ ] Einstellungen-Seite
- [ ] Developer Tools (Passwort)
- [ ] Keyboard Shortcuts

### Phase 7: Testing & Release (Woche 7-8)
- [ ] Unit Tests (Vitest)
- [ ] Component Tests
- [ ] E2E Tests (Playwright)
- [ ] Performance-Optimierung
- [ ] GitHub Workflows einrichten (Build + Release)
- [ ] ir.bat / ir.sh erstellen (Install Requirements)
- [ ] electron-builder.yml mit asarUnpack konfigurieren
- [ ] Installer bauen (electron-builder)
- [ ] Dokumentation

---

## 10. Risiken & Mitigation

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Tesseract.js zu langsam | Mittel | Hoch | Worker-Pool, Caching, Vision-Fallback bei niedriger Konfidenz |
| Vision-Modell zu groß/langsam | Mittel | Hoch | Modell optional (Download beim ersten Start), App bleibt ohne nutzbar, RAM-Anforderung (12-16 GB) klar kommunizieren |
| Speicher läuft voll bei vielen Dokumenten | Niedrig | Mittel | Komprimierung, externe Speicher-Option, Warnung bei 80% |
| Kategorie-Erkennung ungenau | Hoch | Mittel | User-Feedback-Loop, manuelle Korrektur lernen |
| Electron-App zu groß | Mittel | Niedrig | electron-builder optimieren, ungenutzte Dependencies entfernen |
| Native Module nicht im ASAR | Niedrig | Hoch | asarUnpack explizit in electron-builder.yml konfigurieren |
| TypeScript 7.0 ohne programmatische API | Mittel | Mittel | typescript-eslint und ähnliche Tools müssen vorerst bei 6.0 bleiben (Kompatibilitätspaket `@typescript/typescript6` nutzen) |
| Electron-Version inkompatibel | Mittel | Hoch | Version bewusst wählen (v29-v41 bestätigt), bei Update Kompatibilität prüfen |
| Passwort vergessen | Niedrig | Kritisch | Keine Wiederherstellung möglich, klare Warnung im Onboarding |
| glibc-Inkompatibilität (Linux) | Mittel | Mittel | Build-Umgebung auf glibc >= 2.36 prüfen (Electron v39+) |

---

## 11. Entschiedene Entscheidungen

| Frage | Entscheidung |
|-------|-------------|
| Standard-Theme | **Dark** (nur Dark Mode) |
| Autostart | **Nein** (kein Autostart) |
| Cloud-Sync | **Nie** (rein lokal) |
| Multi-User | Nein (Single-User lokal) |
| Mobile App | Später (React Native mit geteilter Logik) |
| OCR-Architektur | **Hybrid**: Tesseract primär, Vision-Modell als Fallback (Main-Prozess) |
| Vision-Modell-Bereitstellung | **Download beim ersten Start** (einmalig, danach offline) |
| Datenbank-Verschlüsselung | **better-sqlite3-multiple-ciphers** (AES-256-CBC) |
| Datei-Verschlüsselung | **AES-256-GCM** (Node crypto) |
| Schlüsselverwaltung | **Master-Passwort** beim Start, scrypt-Ableitung |
| Passwort-Reset | **Nicht möglich** (kein Cloud-Sync, keine Wiederherstellung) |
| Ordner-Struktur | **Firma/Jahr/Monat**, `_unsortiert/` für unbekannte Firmen |
| Metadaten im Dateinamen | **Aus** (UUID-basiert, keine Klardaten) |
| Passwort-Hashing | **Node crypto.scrypt** (kein zusätzliches natives Modul) |
| TypeScript-Version | **7.x** (Go-Port, 8-12x schnellere Builds, programmatische API fehlt noch – Linting via `tsc6` bis 7.1) |

---

## 12. Build- & Release-System

### 12.0 electron-builder Konfiguration

Native Module (better-sqlite3-multiple-ciphers, node-llama-cpp) dürfen **nicht** im ASAR-Archiv landen, da node-llama-cpp bei fehlendem Binary in Electron nicht automatisch nachbaut. Die electron-builder.yml benötigt daher explizites asarUnpack:

```yaml
# electron-builder.yml
appId: com.saveyourdocuments.app
productName: SaveYourDocuments
directories:
  output: dist

# Native Module aus ASAR auspacken (zwingend erforderlich)
asarUnpack:
  - "node_modules/better-sqlite3-multiple-ciphers/**"
  - "node_modules/node-llama-cpp/**"
  - "node_modules/@node-llama-cpp/**"

# Electron-Version bewusst wählen:
# better-sqlite3-multiple-ciphers listet explizit unterstützte Electron-Versionen
# (aktuell v29-v41, v42 in Arbeit). Nicht blind auf die neueste Version gehen.
electronVersion: "41.0.0"  # Aktuell bestätigte Version, bei Update prüfen

files:
  - "**/*"
  - "!**/*.map"

win:
  target:
    - nsis
    - portable

linux:
  target:
    - AppImage
  # Hinweis: Ab Electron v39 benötigen vorgebaute Linux-Binaries glibc >= 2.36
  # Build-Umgebung (ubuntu-latest in CI) muss das unterstützen

mac:
  target:
    - dmg

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

### 12.1 GitHub Workflows

#### Workflow 1: Build bei jedem Commit (Multi-OS)
```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run typecheck
      
      - name: Lint
        run: npm run lint
      
      - name: Run tests
        run: npm run test
      
      - name: Build app
        run: npm run build
      
      - name: Build Electron
        run: npm run electron:build
      
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: saveyourdocuments-${{ matrix.os }}
          path: dist/
          retention-days: 7
```

#### Workflow 2: Release mit ZIP + Installer (Multi-OS)
```yaml
# .github/workflows/release.yml
name: Release

on:
  release:
    types: [created]

jobs:
  release:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest, macos-latest]
        include:
          - os: windows-latest
            artifact_name: win
            installer_ext: exe
            zip_cmd: Compress-Archive
          - os: ubuntu-latest
            artifact_name: linux
            installer_ext: AppImage
            zip_cmd: zip -r
          - os: macos-latest
            artifact_name: mac
            installer_ext: dmg
            zip_cmd: zip -r
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build app
        run: npm run build
      
      - name: Build Electron (portable + installer)
        run: npm run electron:build
      
      - name: Create ZIP (Windows)
        if: matrix.os == 'windows-latest'
        run: |
          Compress-Archive -Path dist/win-unpacked/* -DestinationPath saveyourdocuments-${{ github.event.release.tag_name }}-${{ matrix.artifact_name }}.zip
      
      - name: Create ZIP (Linux/Mac)
        if: matrix.os != 'windows-latest'
        run: |
          cd dist/${{ matrix.artifact_name }}-unpacked
          zip -r ../../saveyourdocuments-${{ github.event.release.tag_name }}-${{ matrix.artifact_name }}.zip .
          cd ../..
      
      - name: Upload ZIP to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: saveyourdocuments-${{ github.event.release.tag_name }}-${{ matrix.artifact_name }}.zip
          asset_name: saveyourdocuments-${{ github.event.release.tag_name }}-${{ matrix.artifact_name }}.zip
          asset_content_type: application/zip
      
      - name: Upload Installer to Release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: dist/saveyourdocuments-${{ github.event.release.tag_name }}.${{ matrix.installer_ext }}
          asset_name: saveyourdocuments-${{ github.event.release.tag_name }}.${{ matrix.installer_ext }}
          asset_content_type: application/octet-stream
```

### 12.2 Install-Requirements-Skripte

#### ir.bat (Windows)
```batch
@echo off
chcp 65001 >nul
echo SaveYourDocuments - Install Requirements
echo =========================================
echo.

echo Prüfe Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Node.js ist nicht installiert!
    echo Bitte installiere Node.js von https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js gefunden: 
node --version

echo.
echo Prüfe npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: npm ist nicht verfügbar!
    pause
    exit /b 1
)
echo npm gefunden:
npm --version

echo.
echo Installiere Dependencies...
npm ci

if errorlevel 1 (
    echo.
    echo FEHLER: Installation fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo =========================================
echo Alle Requirements erfolgreich installiert!
echo =========================================
pause
```

#### ir.sh (Linux/Mac)
```bash
#!/bin/bash

echo "SaveYourDocuments - Install Requirements"
echo "========================================="
echo ""

# Check Node.js
echo "Prüfe Node.js..."
if ! command -v node &> /dev/null; then
    echo "FEHLER: Node.js ist nicht installiert!"
    echo "Bitte installiere Node.js von https://nodejs.org/"
    exit 1
fi
echo "Node.js gefunden: $(node --version)"

# Check npm
echo ""
echo "Prüfe npm..."
if ! command -v npm &> /dev/null; then
    echo "FEHLER: npm ist nicht verfügbar!"
    exit 1
fi
echo "npm gefunden: $(npm --version)"

# Install dependencies
echo ""
echo "Installiere Dependencies..."
npm ci

if [ $? -ne 0 ]; then
    echo ""
    echo "FEHLER: Installation fehlgeschlagen!"
    exit 1
fi

echo ""
echo "========================================="
echo "Alle Requirements erfolgreich installiert!"
echo "========================================="
```

### 12.3 package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:dev": "electron .",
    "electron:build": "electron-builder",
    "electron:build:win": "electron-builder --win",
    "electron:build:linux": "electron-builder --linux",
    "electron:build:mac": "electron-builder --mac",
    "electron:build:all": "electron-builder --win --linux --mac",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src electron --ext ts,tsx",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  }
}
```

---

## 13. Nächste Schritte

1. **Bestätigung des Plans** durch dich
2. **Projekt-Setup** starten (ich kann das komplett aufsetzen)
3. **Phase 1** implementieren

**Soll ich mit dem Setup beginnen?**
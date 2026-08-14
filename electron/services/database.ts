import Database from 'better-sqlite3-multiple-ciphers';
import path from 'path';
import fs from 'fs';
import { getDatabasePath } from '../utils/paths';

export interface DatabaseService {
  db: Database.Database;
  close: () => void;
  run: (sql: string, params?: unknown[]) => Database.RunResult;
  get: (sql: string, params?: unknown[]) => unknown;
  all: (sql: string, params?: unknown[]) => unknown[];
  exec: (sql: string) => void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent_id INTEGER REFERENCES categories(id),
    color TEXT DEFAULT '#3B82F6',
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    folder_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    original_filename TEXT,
    stored_filename TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    ocr_text TEXT,
    ocr_confidence REAL,
    ocr_source TEXT DEFAULT 'tesseract',
    detected_date TEXT,
    detected_amount REAL,
    detected_currency TEXT DEFAULT 'EUR',
    category_id INTEGER REFERENCES categories(id),
    company_id INTEGER REFERENCES companies(id),
    tags TEXT,
    custom_metadata TEXT,
    is_paid BOOLEAN DEFAULT FALSE,
    is_validated BOOLEAN DEFAULT FALSE,
    validation_notes TEXT,
    document_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_document_id INTEGER NOT NULL REFERENCES documents(id),
    target_document_id INTEGER NOT NULL REFERENCES documents(id),
    link_type TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_document_id, target_document_id, link_type)
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6B7280'
);

CREATE TABLE IF NOT EXISTS document_tags (
    document_id INTEGER NOT NULL REFERENCES documents(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (document_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    uuid,
    ocr_text,
    original_filename,
    tags,
    content='documents',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, uuid, ocr_text, original_filename, tags)
    VALUES (new.id, new.uuid, new.ocr_text, new.original_filename, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, uuid, ocr_text, original_filename, tags)
    VALUES ('delete', old.id, old.uuid, old.ocr_text, old.original_filename, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, uuid, ocr_text, original_filename, tags)
    VALUES ('delete', old.id, old.uuid, old.ocr_text, old.original_filename, old.tags);
    INSERT INTO documents_fts(rowid, uuid, ocr_text, original_filename, tags)
    VALUES (new.id, new.uuid, new.ocr_text, new.original_filename, new.tags);
END;

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    user_confirmed BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_paid ON documents(is_paid);
CREATE INDEX IF NOT EXISTS idx_documents_validated ON documents(is_validated);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
`;

export function setupDatabase(dataDir: string, encryptionKey?: Buffer): DatabaseService {
  const dbPath = getDatabasePath(dataDir);
  const db = new Database(dbPath);

  if (encryptionKey) {
    if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
      throw new Error('Datenbank-Schlüssel muss ein 32-Byte-Buffer sein');
    }
    try {
      db.pragma(`key="x'${encryptionKey.toString('hex')}'"`);
    } catch (error) {
      db.close();
      throw new Error(`Datenbankverschlüsselung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    }
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA);
  db.exec("INSERT INTO documents_fts(documents_fts) VALUES ('rebuild')");

  return {
    db,
    close: () => db.close(),
    run: (sql: string, params?: unknown[]) => {
      const stmt = db.prepare(sql);
      return params ? stmt.run(...params) : stmt.run();
    },
    get: (sql: string, params?: unknown[]) => {
      const stmt = db.prepare(sql);
      return params ? stmt.get(...params) : stmt.get();
    },
    all: (sql: string, params?: unknown[]) => {
      const stmt = db.prepare(sql);
      return params ? stmt.all(...params) : stmt.all();
    },
    exec: (sql: string) => db.exec(sql),
  };
}

export function createDefaultCategories(db: DatabaseService): void {
  const defaultCategories = [
    { name: 'Versicherung', color: '#3B82F6' },
    { name: 'Kauf', color: '#22C55E' },
    { name: 'Bank', color: '#F59E0B' },
    { name: 'Vertrag', color: '#8B5CF6' },
    { name: 'Behörde', color: '#EF4444' },
  ];

  const insert = db.db.prepare('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)');
  for (const cat of defaultCategories) {
    insert.run(cat.name, cat.color);
  }
}

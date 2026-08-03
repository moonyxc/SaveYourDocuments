import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { ArchiveMeta } from '../../../shared/domain/types';
import { logger } from '../../app/logger';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private archiveMeta: ArchiveMeta | null = null;

  get isOpen(): boolean {
    return this.db !== null;
  }

  get meta(): ArchiveMeta | null {
    return this.archiveMeta;
  }

  createArchive(filePath: string, displayName: string, password?: string): ArchiveMeta {
    logger.info('Creating archive', { filePath, displayName, encrypted: !!password });

    if (this.db) {
      logger.warn('Closing existing archive before creating new one');
      this.close();
    }

    if (fs.existsSync(filePath)) {
      throw new Error('Eine Datei existiert bereits unter diesem Pfad.');
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created directory', { dir });
    }

    this.db = new Database(filePath);
    logger.info('Database opened', { filePath });

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    if (password) {
      this.db.pragma(`key = '${password}'`);
    }

    this.runMigrations();
    logger.info('Migrations completed');

    const meta: ArchiveMeta = {
      id: uuidv4(),
      displayName,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      encrypted: !!password,
    };

    this.db
      .prepare(
        `INSERT INTO archive_meta (id, display_name, schema_version, created_at, encrypted)
       VALUES (?, ?, ?, ?, ?)`
      )
      .run(meta.id, meta.displayName, meta.schemaVersion, meta.createdAt, meta.encrypted ? 1 : 0);

    this.archiveMeta = meta;
    logger.info('Archive created successfully', { id: meta.id });
    return meta;
  }

  openArchive(filePath: string, password?: string): ArchiveMeta {
    logger.info('Opening archive', { filePath });

    if (this.db) {
      logger.warn('Closing existing archive before opening');
      this.close();
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('Archivdatei nicht gefunden.');
    }

    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    if (password) {
      try {
        this.db.pragma(`key = '${password}'`);
        this.db.prepare('SELECT count(*) FROM archive_meta').get();
      } catch {
        this.db.close();
        this.db = null;
        logger.error('Archive open failed: wrong password');
        throw new Error('Falsches Passwort oder beschädigtes Archiv.');
      }
    }

    const row = this.db.prepare('SELECT * FROM archive_meta LIMIT 1').get() as Record<string, unknown> | undefined;
    if (!row) {
      this.db.close();
      this.db = null;
      logger.error('Archive open failed: no metadata');
      throw new Error('Archiv ist beschädigt: Keine Metadaten gefunden.');
    }

    this.archiveMeta = {
      id: row.id as string,
      displayName: row.display_name as string,
      schemaVersion: row.schema_version as number,
      createdAt: row.created_at as string,
      encrypted: !!row.encrypted,
    };

    logger.info('Archive opened successfully', { id: this.archiveMeta.id });
    return this.archiveMeta;
  }

  close(): void {
    if (this.db) {
      try {
        logger.info('Closing database');
        this.db.pragma('wal_checkpoint(TRUNCATE)');
        this.db.close();
      } catch (err) {
        logger.error('Error closing database', { error: String(err) });
      }
      this.db = null;
      this.archiveMeta = null;
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Kein Archiv geöffnet.');
    }
    return this.db;
  }

  private runMigrations(): void {
    if (!this.db) throw new Error('Keine Datenbankverbindung.');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS archive_meta (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        encrypted INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sha256_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'imported',
        company_id TEXT,
        category TEXT,
        sub_category TEXT,
        document_date TEXT,
        document_date_precision TEXT,
        amount INTEGER,
        currency TEXT,
        payment_status TEXT NOT NULL DEFAULT 'not_relevant',
        due_date TEXT,
        payment_date TEXT,
        paid_amount INTEGER,
        payment_note TEXT,
        language TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS document_blobs (
        document_id TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS document_pages (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        ocr_text TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        language TEXT,
        engine_version TEXT,
        preview_blob BLOB,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        address TEXT,
        contact TEXT,
        notes TEXT,
        default_category TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS company_aliases (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS document_tags (
        document_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (document_id, tag_id),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS document_relations (
        id TEXT PRIMARY KEY,
        source_document_id TEXT NOT NULL,
        target_document_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (target_document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS metadata_candidates (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        location TEXT,
        rule TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress REAL NOT NULL DEFAULT 0,
        error TEXT,
        retries INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        timezone TEXT NOT NULL,
        action TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT,
        result TEXT NOT NULL,
        session_id TEXT NOT NULL,
        previous_values TEXT,
        new_values TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        display_name,
        ocr_text,
        company_name,
        tags,
        content='',
        contentless_delete=1
      );
    `);
  }
}
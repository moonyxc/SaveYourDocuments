import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseManager } from '../../src/main/infrastructure/database/manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DatabaseManager', () => {
  let dbPath: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-archive-${Date.now()}.syd`);
    manager = new DatabaseManager();
  });

  afterEach(() => {
    if (manager.isOpen) {
      manager.close();
    }
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}
  });

  it('creates a new archive', () => {
    const meta = manager.createArchive(dbPath, 'TestArchiv');
    expect(meta.displayName).toBe('TestArchiv');
    expect(meta.schemaVersion).toBe(1);
    expect(meta.encrypted).toBe(false);
    expect(meta.id).toBeTruthy();
    expect(manager.isOpen).toBe(true);
  });

  it('creates all required tables', () => {
    manager.createArchive(dbPath, 'Test');
    const db = manager.getDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('documents');
    expect(tableNames).toContain('document_blobs');
    expect(tableNames).toContain('document_pages');
    expect(tableNames).toContain('companies');
    expect(tableNames).toContain('company_aliases');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('document_tags');
    expect(tableNames).toContain('document_relations');
    expect(tableNames).toContain('metadata_candidates');
    expect(tableNames).toContain('jobs');
    expect(tableNames).toContain('audit_events');
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('schema_migrations');
    expect(tableNames).toContain('archive_meta');
  });

  it('can close and reopen an archive', () => {
    const meta = manager.createArchive(dbPath, 'Test');
    manager.close();
    expect(manager.isOpen).toBe(false);

    const meta2 = manager.openArchive(dbPath);
    expect(meta2.id).toBe(meta.id);
    expect(meta2.displayName).toBe('Test');
  });

  it('throws on duplicate archive creation', () => {
    manager.createArchive(dbPath, 'Test');
    manager.close();
    expect(() => manager.createArchive(dbPath, 'Test2')).toThrow();
  });

  it('throws on opening non-existent archive', () => {
    expect(() => manager.openArchive('/nonexistent/path.syd')).toThrow();
  });

  it('supports FTS5 virtual table', () => {
    manager.createArchive(dbPath, 'Test');
    const db = manager.getDatabase();
    const ftsTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'")
      .all() as { name: string }[];
    expect(ftsTables.length).toBeGreaterThan(0);
    expect(ftsTables.some((t) => t.name === 'documents_fts')).toBe(true);
  });
});
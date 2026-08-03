import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditService } from '../../src/main/app/audit-service';

describe('AuditService', () => {
  let dbPath: string;
  let db: Database.Database;
  let audit: AuditService;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-audit-${Date.now()}.syd`);
    db = new Database(dbPath);
    db.exec(`
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
    `);
    audit = new AuditService();
    audit.setDatabase(db);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('logs an event and retrieves it', () => {
    audit.log('test_action', 'test_type', 'test-123', 'success', { old: 'a' }, { new: 'b' });
    const events = audit.getEvents();
    expect(events.length).toBe(1);
    expect((events[0] as Record<string, unknown>).action).toBe('test_action');
    expect((events[0] as Record<string, unknown>).object_id).toBe('test-123');
    expect((events[0] as Record<string, unknown>).result).toBe('success');
  });

  it('logs multiple events', () => {
    audit.log('action1', 'type1', '1', 'success');
    audit.log('action2', 'type2', '2', 'failure');
    const events = audit.getEvents();
    expect(events.length).toBe(2);
  });

  it('filters by date', () => {
    audit.log('action1', 'type1', '1', 'success');
    const today = new Date().toISOString().slice(0, 10);
    const events = audit.getEvents(today);
    expect(events.length).toBe(1);
  });

  it('returns empty array when no DB is set', () => {
    const emptyAudit = new AuditService();
    expect(emptyAudit.getEvents()).toEqual([]);
  });
});
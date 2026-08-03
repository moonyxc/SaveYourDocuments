import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  private db: Database.Database | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = uuidv4();
  }

  setDatabase(db: Database.Database): void {
    this.db = db;
  }

  log(
    action: string,
    objectType: string,
    objectId: string | null,
    result: string,
    previousValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
  ): void {
    if (!this.db) return;
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    this.db
      .prepare(
        `INSERT INTO audit_events (id, timestamp, timezone, action, object_type, object_id, result, session_id, previous_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        timestamp,
        timezone,
        action,
        objectType,
        objectId,
        result,
        this.sessionId,
        previousValues ? JSON.stringify(previousValues) : null,
        newValues ? JSON.stringify(newValues) : null,
      );
  }

  getEvents(date?: string, limit = 500): unknown[] {
    if (!this.db) return [];
    if (date) {
      return this.db
        .prepare('SELECT * FROM audit_events WHERE date(timestamp) = ? ORDER BY timestamp DESC')
        .all(date);
    }
    return this.db
      .prepare('SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?')
      .all(limit);
  }
}
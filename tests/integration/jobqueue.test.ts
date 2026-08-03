import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JobQueue } from '../../src/main/infrastructure/jobs/queue';

describe('JobQueue', () => {
  let dbPath: string;
  let db: Database.Database;
  let queue: JobQueue;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-jobqueue-${Date.now()}.syd`);
    db = new Database(dbPath);
    db.exec(`
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    queue = new JobQueue();
    queue.setDatabase(db);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('enqueues a job and returns its ID', async () => {
    queue.registerHandler('test_job', async () => { /* noop */ });
    const id = queue.enqueue({ documentId: 'doc-1', type: 'test_job' });
    expect(id).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    const status = queue.getStatus('doc-1');
    expect(status).toBeTruthy();
    expect(status?.type).toBe('test_job');
  });

  it('cancels a job', () => {
    const id = queue.enqueue({ documentId: 'doc-2', type: 'test_job' });
    queue.cancel(id);
    const status = queue.getStatus('doc-2');
    expect(status?.status).toBe('cancelled');
  });

  it('executes a job via registered handler', async () => {
    let executed = false;
    queue.registerHandler('handled_job', async () => {
      executed = true;
    });
    queue.enqueue({ documentId: 'doc-3', type: 'handled_job' });
    // Wait for async execution
    await new Promise((r) => setTimeout(r, 100));
    expect(executed).toBe(true);
    const status = queue.getStatus('doc-3');
    expect(status?.status).toBe('completed');
  });

  it('retries failed jobs', async () => {
    let attempts = 0;
    queue.registerHandler('flaky_job', async () => {
      attempts++;
      if (attempts < 2) throw new Error('Temporary error');
    });
    queue.enqueue({ documentId: 'doc-4', type: 'flaky_job', maxRetries: 3 });
    await new Promise((r) => setTimeout(r, 200));
    expect(attempts).toBe(2);
    const status = queue.getStatus('doc-4');
    expect(status?.status).toBe('completed');
  });

  it('marks job as failed after max retries', async () => {
    queue.registerHandler('always_fail', async () => {
      throw new Error('Always fails');
    });
    queue.enqueue({ documentId: 'doc-5', type: 'always_fail', maxRetries: 2 });
    await new Promise((r) => setTimeout(r, 300));
    const status = queue.getStatus('doc-5');
    expect(status?.status).toBe('failed');
    expect(status?.error).toBeTruthy();
  });
});
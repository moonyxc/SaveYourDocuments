import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';

export interface JobDefinition {
  documentId: string;
  type: string;
  maxRetries?: number;
}

export class JobQueue {
  private db: Database.Database | null = null;
  private running = false;
  private handlers = new Map<string, (job: JobRecord) => Promise<void>>();
  private maxConcurrent = 2;
  private activeJobs = 0;

  setDatabase(db: Database.Database): void {
    this.db = db;
  }

  registerHandler(type: string, handler: (job: JobRecord) => Promise<void>): void {
    this.handlers.set(type, handler);
  }

  enqueue(job: JobDefinition): string {
    if (!this.db) throw new Error('No database connection');
    const id = uuidv4();
    this.db
      .prepare(
        `INSERT INTO jobs (id, document_id, type, status, progress, retries, max_retries)
         VALUES (?, ?, ?, 'pending', 0, 0, ?)`,
      )
      .run(id, job.documentId, job.type, job.maxRetries ?? 3);
    this.processNext();
    return id;
  }

  cancel(jobId: string): void {
    if (!this.db) return;
    this.db
      .prepare("UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?")
      .run(jobId);
  }

  getStatus(documentId: string): JobRecord | null {
    if (!this.db) return null;
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE document_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(documentId) as Record<string, unknown> | undefined;
    return row ? row as JobRecord : null;
  }

  recoverStaleJobs(): void {
    if (!this.db) return;
    this.db
      .prepare("UPDATE jobs SET status = 'pending', updated_at = datetime('now') WHERE status = 'running'")
      .run();
    this.processNext();
  }

  private processNext(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  private tick(): void {
    if (!this.db || this.activeJobs >= this.maxConcurrent) {
      this.running = false;
      return;
    }

    const job = this.db
      .prepare(
        "SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
      )
      .get() as Record<string, unknown> | undefined;

    if (!job) {
      this.running = false;
      return;
    }

    this.executeJob(job as JobRecord);
  }

  private async executeJob(job: JobRecord): Promise<void> {
    if (!this.db) return;
    this.activeJobs++;

    this.db
      .prepare("UPDATE jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?")
      .run(job.id);

    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.db
        .prepare("UPDATE jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?")
        .run('No handler for job type', job.id);
      this.activeJobs--;
      this.tick();
      return;
    }

    try {
      await handler(job);
      if (!this.db) return;
      this.db
        .prepare(
          "UPDATE jobs SET status = 'completed', progress = 100, updated_at = datetime('now') WHERE id = ?",
        )
        .run(job.id);
    } catch (error) {
      if (!this.db) return;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const newRetries = job.retries + 1;
      if (newRetries < job.max_retries) {
        this.db
          .prepare(
            "UPDATE jobs SET status = 'pending', retries = ?, error = ?, updated_at = datetime('now') WHERE id = ?",
          )
          .run(newRetries, errMsg, job.id);
      } else {
        this.db
          .prepare(
            "UPDATE jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?",
          )
          .run(errMsg, job.id);
      }
    } finally {
      this.activeJobs--;
      this.tick();
    }
  }
}

export type JobRecord = {
  id: string;
  document_id: string;
  type: string;
  status: string;
  progress: number;
  error: string | null;
  retries: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
};

export const jobQueue = new JobQueue();
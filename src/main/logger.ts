import fs from 'fs';
import path from 'path';
import type { LogEntry } from '../shared/types';

export class DailyLogger {
  private logsDir: string;

  constructor(dataDir: string) {
    this.logsDir = path.join(dataDir, 'logs');
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  private fileFor(date: string): string {
    return path.join(this.logsDir, `${date}.jsonl`);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  log(level: LogEntry['level'], event: string, details?: unknown): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      event,
      details
    };
    try {
      fs.appendFileSync(this.fileFor(this.today()), JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.error('[logger] Schreiben fehlgeschlagen:', err);
    }
    const line = `[${entry.ts}] [${level.toUpperCase()}] ${event}`;
    if (level === 'error') console.error(line, details ?? '');
    else console.log(line, details ?? '');
  }

  info(event: string, details?: unknown): void {
    this.log('info', event, details);
  }

  warn(event: string, details?: unknown): void {
    this.log('warn', event, details);
  }

  error(event: string, details?: unknown): void {
    this.log('error', event, details);
  }

  listDates(): string[] {
    if (!fs.existsSync(this.logsDir)) return [];
    return fs
      .readdirSync(this.logsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.replace(/\.jsonl$/, ''))
      .sort()
      .reverse();
  }

  read(date: string): LogEntry[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const file = this.fileFor(date);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    const entries: LogEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as LogEntry);
      } catch {
        // kaputte Zeile ueberspringen
      }
    }
    return entries;
  }
}

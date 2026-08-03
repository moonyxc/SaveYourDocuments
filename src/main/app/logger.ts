import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

let logPath: string | null = null;
let pendingLogs: string[] = [];

function getLogPath(): string {
  if (logPath) return logPath;
  if (app.isReady()) {
    logPath = path.join(app.getPath('userData'), 'log.txt');
    // Flush pending logs
    if (pendingLogs.length > 0) {
      try {
        fs.appendFileSync(logPath, pendingLogs.join(''), 'utf-8');
      } catch {}
      pendingLogs = [];
    }
    return logPath;
  }
  // Fallback: use cwd before app is ready
  return path.join(process.cwd(), 'log.txt');
}

function write(level: string, message: string, data?: unknown): void {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;

    if (app.isReady()) {
      fs.appendFileSync(getLogPath(), line, 'utf-8');
    } else {
      pendingLogs.push(line);
    }
  } catch {
    // Silently fail
  }
}

export const logger = {
  info(message: string, data?: unknown): void {
    write('INFO', message, data);
  },
  warn(message: string, data?: unknown): void {
    write('WARN', message, data);
  },
  error(message: string, data?: unknown): void {
    write('ERROR', message, data);
  },
  debug(message: string, data?: unknown): void {
    write('DEBUG', message, data);
  },
  getPath(): string {
    return getLogPath();
  },
};
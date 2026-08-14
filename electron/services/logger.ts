import log from 'electron-log';
import path from 'path';

export interface LoggerService {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  getLogPath: () => string;
}

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function setupLogger(logsDir: string): LoggerService {
  log.transports.file.resolvePath = () => path.join(logsDir, `${getLocalDateString()}.log`);
  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';
  log.transports.file.maxSize = MAX_LOG_SIZE_BYTES;

  return {
    info: (message: string, data?: unknown) => {
      log.info(message, data);
    },
    warn: (message: string, data?: unknown) => {
      log.warn(message, data);
    },
    error: (message: string, data?: unknown) => {
      log.error(message, data);
    },
    debug: (message: string, data?: unknown) => {
      log.debug(message, data);
    },
    getLogPath: () => path.join(logsDir, `${getLocalDateString()}.log`),
  };
}

import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './app/ipc-handlers';
import { checkForUpdates } from './app/update-check';
import { DatabaseManager } from './infrastructure/database/manager';
import { AuditService } from './app/audit-service';
import { jobQueue } from './infrastructure/jobs/queue';
import { importPipeline } from './infrastructure/import/pipeline';
import { logger } from './app/logger';

let mainWindow: BrowserWindow | null = null;
let dbManager: DatabaseManager | null = null;
let auditService: AuditService | null = null;

function createWindow(): void {
  logger.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SaveYourData',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window shown');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`Page load failed: ${errorCode} ${errorDescription}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    logger.info('Loading dev URL: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
    logger.info(`Loading file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
}

function setupSecurity(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.github.com",
        ],
      },
    });
  });
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { message: error.message, stack: error.stack });
  console.error('CRASH:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  console.error('UNHANDLED REJECTION:', reason);
});

app.whenReady().then(async () => {
  logger.info('App ready, initializing');
  setupSecurity();

  dbManager = new DatabaseManager();
  auditService = new AuditService();

  registerIpcHandlers(dbManager, auditService, importPipeline, jobQueue);

  createWindow();

  const skipUpdate = process.argv.includes('--noupdate');
  if (!skipUpdate) {
    checkForUpdates().catch((err) => {
      logger.warn('Update check failed', { error: err.message });
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  try {
    dbManager?.close();
  } catch (err) {
    logger.error('Error closing database', { error: String(err) });
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logger.info('App quitting');
  try {
    dbManager?.close();
  } catch (err) {
    logger.error('Error closing database on quit', { error: String(err) });
  }
});

export { dbManager, auditService, importPipeline, jobQueue };
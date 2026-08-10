import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, globalShortcut } from 'electron';
import { Database } from './database';
import { DailyLogger } from './logger';
import { registerIpcHandlers } from './ipc';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

const dataDir = path.join(app.getPath('userData'), 'data');
const documentsRoot = path.join(dataDir, 'documents');
const tmpDir = path.join(dataDir, 'tmp');
const thumbDir = path.join(documentsRoot, '.thumbnails');

for (const dir of [dataDir, documentsRoot, tmpDir, thumbDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const logger = new DailyLogger(dataDir);
const db = new Database(dataDir, logger);

const devTools = { enabled: false };

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Save Your Documents',
    backgroundColor: '#f3f4f6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const wantsDevTools =
      input.key === 'F12' ||
      ((input.control || input.meta) && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase()));
    if (wantsDevTools) {
      if (!devTools.enabled && !isDev) {
        event.preventDefault();
        logger.warn('devtools:blocked');
      }
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('app:window-created');
}

app.whenReady().then(() => {
  registerIpcHandlers({
    db,
    logger,
    dataDir,
    documentsRoot,
    tmpDir,
    thumbDir,
    devTools,
    getWindow: () => mainWindow
  });

  createWindow();

  globalShortcut.register('F12', () => {
    if (!devTools.enabled && !isDev) return;
    if (!mainWindow) return;
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  logger.info('app:ready', { version: app.getVersion(), dataDir });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  logger.info('app:quit');
});

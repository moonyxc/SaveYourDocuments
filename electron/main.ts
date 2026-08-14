import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { setupDatabase, createDefaultCategories, DatabaseService } from './services/database';
import { setupLogger } from './services/logger';
import { setupFileStorage, FileStorageService } from './services/fileStorage';
import { setupOcrEngine, OcrEngineService } from './services/ocrEngine';
import { registerIpcHandlers, setLogger } from './ipc';
import { getAppPaths } from './utils/paths';

const isDev = process.env.NODE_ENV === 'development';
const appDir = __dirname;

let mainWindow: BrowserWindow | null = null;
let isUnlocked = false;
let db: DatabaseService | null = null;
let ocrEngine: OcrEngineService | null = null;
let fileStorage: FileStorageService | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(appDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    frame: true,
    show: false,
    backgroundColor: '#0f172a',
  });

  const win = mainWindow;

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(appDir, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

async function initializeServices() {
  const paths = getAppPaths();

  const logger = setupLogger(paths.logsDir);
  setLogger(logger);

  db = setupDatabase(paths.dataDir);
  createDefaultCategories(db);
  fileStorage = setupFileStorage(paths.storageDir, paths.thumbnailsDir);
  ocrEngine = setupOcrEngine(paths.modelsDir);

  registerIpcHandlers({
    db,
    fileStorage,
    ocrEngine,
    paths,
    getMainWindow: () => mainWindow,
    setUnlocked: (value: boolean) => { isUnlocked = value; },
    getUnlocked: () => isUnlocked,
  });

  return { db, fileStorage, ocrEngine };
}

let servicesInitialized = false;

app.whenReady().then(async () => {
  try {
    if (!servicesInitialized) {
      await initializeServices();
      servicesInitialized = true;
    }
    await createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    dialog.showErrorBox('Fehler beim Start', `Die Anwendung konnte nicht gestartet werden:\n${message}`);
    app.quit();
    return;
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (!servicesInitialized) {
    return;
  }
  event.preventDefault();
  isUnlocked = false;
  try {
    if (ocrEngine) {
      await ocrEngine.close();
    }
    if (db) {
      db.close();
    }
  } finally {
    servicesInitialized = false;
    app.exit(0);
  }
});

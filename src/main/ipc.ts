import fs from 'fs';
import path from 'path';
import { app, dialog, ipcMain, shell, BrowserWindow, nativeImage } from 'electron';
import type {
  Company, ConfirmItem, Doc, RendererConfig, Stats, ValidationSuggestion
} from '../shared/types';
import type { Database } from './database';
import type { DailyLogger } from './logger';
import { extractText, isImage, isPdf } from './ocr';
import {
  classifyCategory, classifySubcategory, detectCompany, extractAmount, extractDate, guessTitle
} from './recognition';
import { buildStoredFileName, renameStoredFile, sanitizeFolderName, uniquePath } from './storage';

interface PendingItem {
  id: string;
  tmpPath: string;
  fileName: string;
  ext: string;
  mimeType: string;
  title: string;
  ocrText: string;
}

const pending = new Map<string, PendingItem>();

export interface IpcContext {
  db: Database;
  logger: DailyLogger;
  dataDir: string;
  documentsRoot: string;
  tmpDir: string;
  thumbDir: string;
  devTools: { enabled: boolean };
  getWindow: () => BrowserWindow | null;
}

function mimeTypeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    case '.tif':
    case '.tiff': return 'image/tiff';
    case '.pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

function companyFolder(ctx: IpcContext, companyName: string): string {
  return path.join(ctx.documentsRoot, sanitizeFolderName(companyName));
}

function ensureCompanyFolder(ctx: IpcContext, company: Company | null, companyName: string | null): string {
  if (company) {
    fs.mkdirSync(company.folderPath, { recursive: true });
    return company.folderPath;
  }
  if (companyName) {
    const folder = companyFolder(ctx, companyName);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  }
  const misc = path.join(ctx.documentsRoot, 'Sonstiges');
  fs.mkdirSync(misc, { recursive: true });
  return misc;
}

function makeThumbnail(ctx: IpcContext, sourcePath: string, id: string): string | null {
  try {
    if (!isImage(sourcePath)) return null;
    const image = nativeImage.createFromPath(sourcePath);
    if (image.isEmpty()) return null;
    const resized = image.resize({ width: 320 });
    fs.mkdirSync(ctx.thumbDir, { recursive: true });
    const thumbPath = path.join(ctx.thumbDir, `${id}.jpg`);
    fs.writeFileSync(thumbPath, resized.toJPEG(80));
    return thumbPath;
  } catch {
    return null;
  }
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { db, logger } = ctx;

  ipcMain.handle('app:get-config', (): RendererConfig => ({
    devToolsEnabled: ctx.devTools.enabled,
    devToolsPasswordSet: db.getSettings().devToolsPasswordHash !== null
  }));

  ipcMain.handle('docs:import', async (): Promise<ValidationSuggestion[]> => {
    const win = ctx.getWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      title: 'Dokumente importieren',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Dokumente', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tif', 'tiff', 'pdf'] },
        { name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tif', 'tiff'] },
        { name: 'PDF', extensions: ['pdf'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const settings = db.getSettings();
    const knownCompanyNames = db.listCompanies().map((c) => c.name);
    const suggestions: ValidationSuggestion[] = [];

    for (const filePath of result.filePaths) {
      const ext = path.extname(filePath);
      const fileName = path.basename(filePath);
      const id = db.id();
      const tmpPath = path.join(ctx.tmpDir, `${id}${ext}`);
      fs.mkdirSync(ctx.tmpDir, { recursive: true });
      fs.copyFileSync(filePath, tmpPath);

      logger.info('import:start', { fileName });

      let ocrText = '';
      if (isImage(filePath)) {
        ocrText = await extractText(tmpPath, settings.ocrLanguage, logger);
      } else if (isPdf(filePath)) {
        ocrText = '';
        logger.info('import:pdf-no-ocr', { fileName });
      } else {
        logger.warn('import:unsupported', { fileName });
        fs.rmSync(tmpPath, { force: true });
        continue;
      }

      const category = classifyCategory(ocrText);
      const subcategory = classifySubcategory(ocrText, category);
      const date = extractDate(ocrText);
      const { amount, currency } = extractAmount(ocrText);
      const detected = detectCompany(ocrText, knownCompanyNames);

      let suggestedCompanyId: string | null = null;
      let suggestedCompanyName: string | null = null;
      let isNewCompany = false;
      if (detected) {
        const existing = db.findCompanyByName(detected.name);
        if (existing) {
          suggestedCompanyId = existing.id;
          suggestedCompanyName = existing.name;
        } else {
          suggestedCompanyName = detected.name;
          isNewCompany = true;
        }
      }

      const baseTitle = guessTitle(ocrText, fileName);
      const title = subcategory ? `${baseTitle} (${subcategory})` : baseTitle;

      const thumbnailPath = makeThumbnail(ctx, tmpPath, id);
      let thumbnailDataUrl: string | null = null;
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        const buf = fs.readFileSync(thumbnailPath);
        thumbnailDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } else if (isPdf(filePath)) {
        thumbnailDataUrl = null;
      }

      pending.set(id, {
        id,
        tmpPath,
        fileName,
        ext,
        mimeType: mimeTypeFor(ext),
        title,
        ocrText
      });

      suggestions.push({
        id,
        title,
        fileName,
        category,
        suggestedCompanyId,
        suggestedCompanyName,
        isNewCompany,
        date,
        amount,
        currency,
        paid: false,
        tags: subcategory ? [subcategory] : [],
        thumbnailDataUrl,
        ocrSnippet: ocrText.slice(0, 600),
        notes: '',
        showMetaInName: settings.showMetaInNameDefault
      });

      logger.info('import:scanned', {
        fileName, category, subcategory, date, amount,
        company: suggestedCompanyName, isNewCompany
      });
    }

    return suggestions;
  });

  ipcMain.handle('docs:confirm-import', (_event, items: ConfirmItem[]): { imported: number } => {
    let imported = 0;
    for (const item of items) {
      const p = pending.get(item.id);
      if (!p) {
        logger.warn('import:confirm-missing', { id: item.id });
        continue;
      }

      let company: Company | null = null;
      if (item.companyId) {
        company = db.getCompany(item.companyId);
      } else if (item.newCompanyName && item.newCompanyName.trim().length > 0) {
        const folder = companyFolder(ctx, item.newCompanyName);
        fs.mkdirSync(folder, { recursive: true });
        company = db.createCompany(item.newCompanyName, folder);
        logger.info('company:created', { name: company.name });
      }

      const now = new Date().toISOString();
      const doc: Doc = {
        id: item.id,
        title: item.title.trim() || p.fileName,
        fileName: p.fileName,
        mimeType: p.mimeType,
        storedPath: '',
        thumbnailPath: null,
        category: item.category,
        companyId: company ? company.id : null,
        date: item.date,
        amount: item.amount,
        currency: item.currency,
        paid: item.paid,
        tags: item.tags.map((t) => t.trim()).filter((t) => t.length > 0),
        notes: item.notes,
        ocrText: p.ocrText,
        showMetaInName: item.showMetaInName,
        validated: true,
        createdAt: now,
        updatedAt: now
      };

      const folder = ensureCompanyFolder(ctx, company, company ? null : null);
      const storedName = buildStoredFileName(doc, p.ext);
      const target = uniquePath(path.join(folder, storedName));
      fs.renameSync(p.tmpPath, target);
      doc.storedPath = target;
      doc.fileName = path.basename(target);

      const oldThumb = path.join(ctx.thumbDir, `${item.id}.jpg`);
      if (fs.existsSync(oldThumb)) {
        doc.thumbnailPath = oldThumb;
      }

      db.insertDocument(doc);
      pending.delete(item.id);
      imported += 1;
      logger.info('import:confirmed', {
        id: doc.id, title: doc.title, category: doc.category,
        company: company?.name ?? null, date: doc.date, amount: doc.amount, paid: doc.paid
      });
    }

    for (const [id, p] of pending) {
      if (!items.some((i) => i.id === id)) {
        fs.rmSync(p.tmpPath, { force: true });
        fs.rmSync(path.join(ctx.thumbDir, `${id}.jpg`), { force: true });
        pending.delete(id);
        logger.info('import:discarded', { fileName: p.fileName });
      }
    }

    return { imported };
  });

  ipcMain.handle('docs:list', (): Doc[] => db.listDocuments());

  ipcMain.handle('docs:get', (_e, id: string): Doc | null => db.getDocument(id));

  ipcMain.handle('docs:update', (_e, id: string, patch: Partial<Doc>): Doc | null => {
    const doc = db.getDocument(id);
    if (!doc) return null;
    const allowed: (keyof Doc)[] = [
      'title', 'category', 'companyId', 'date', 'amount', 'currency',
      'paid', 'tags', 'notes', 'showMetaInName'
    ];
    const clean: Partial<Doc> = {};
    for (const key of allowed) {
      if (key in patch) {
        (clean as Record<string, unknown>)[key] = patch[key];
      }
    }
    Object.assign(doc, clean);
    renameStoredFile(ctx.documentsRoot, doc);
    const updated = db.updateDocument(id, {
      storedPath: doc.storedPath,
      fileName: doc.fileName,
      thumbnailPath: doc.thumbnailPath,
      ...clean
    });
    logger.info('doc:updated', { id, fields: Object.keys(clean) });
    return updated;
  });

  ipcMain.handle('docs:delete', (_e, id: string): boolean => {
    const doc = db.deleteDocument(id);
    if (!doc) return false;
    fs.rmSync(doc.storedPath, { force: true });
    if (doc.thumbnailPath) fs.rmSync(doc.thumbnailPath, { force: true });
    logger.info('doc:deleted', { id, title: doc.title });
    return true;
  });

  ipcMain.handle('docs:open', async (_e, id: string): Promise<boolean> => {
    const doc = db.getDocument(id);
    if (!doc || !fs.existsSync(doc.storedPath)) return false;
    const result = await shell.openPath(doc.storedPath);
    if (result) {
      logger.error('doc:open-failed', { id, result });
      return false;
    }
    logger.info('doc:opened', { id });
    return true;
  });

  ipcMain.handle('docs:reveal', (_e, id: string): boolean => {
    const doc = db.getDocument(id);
    if (!doc || !fs.existsSync(doc.storedPath)) return false;
    shell.showItemInFolder(doc.storedPath);
    logger.info('doc:revealed', { id });
    return true;
  });

  ipcMain.handle('docs:get-data', (_e, id: string): string | null => {
    const doc = db.getDocument(id);
    if (!doc || !fs.existsSync(doc.storedPath)) return null;
    if (isImage(doc.storedPath)) {
      const buf = fs.readFileSync(doc.storedPath);
      return `data:${doc.mimeType};base64,${buf.toString('base64')}`;
    }
    return null;
  });

  ipcMain.handle('companies:list', (): Company[] => db.listCompanies());

  ipcMain.handle('companies:create', (_e, name: string): Company => {
    const existing = db.findCompanyByName(name);
    if (existing) return existing;
    const folder = companyFolder(ctx, name);
    fs.mkdirSync(folder, { recursive: true });
    const company = db.createCompany(name, folder);
    logger.info('company:created', { name: company.name });
    return company;
  });

  ipcMain.handle('companies:rename', (_e, id: string, name: string): Company | null => {
    const company = db.renameCompany(id, name);
    if (company) logger.info('company:renamed', { id, name });
    return company;
  });

  ipcMain.handle('companies:delete', (_e, id: string): boolean => {
    const ok = db.deleteCompany(id);
    if (ok) logger.info('company:deleted', { id });
    return ok;
  });

  ipcMain.handle('links:link', (_e, aId: string, bId: string): boolean => {
    const ok = db.linkDocuments(aId, bId);
    if (ok) logger.info('docs:linked', { aId, bId });
    return ok;
  });

  ipcMain.handle('links:unlink', (_e, aId: string, bId: string): boolean => {
    const ok = db.unlinkDocuments(aId, bId);
    if (ok) logger.info('docs:unlinked', { aId, bId });
    return ok;
  });

  ipcMain.handle('links:for', (_e, id: string): Doc[] => {
    const ids = db.linkedDocumentIds(id);
    return ids.map((lid) => db.getDocument(lid)).filter((d): d is Doc => d !== null);
  });

  ipcMain.handle('tags:list', (): string[] => db.allTags());

  ipcMain.handle('logs:list-dates', (): string[] => logger.listDates());

  ipcMain.handle('logs:get', (_e, date: string) => logger.read(date));

  ipcMain.handle('stats:get', (): Stats => ({
    documents: db.listDocuments().length,
    companies: db.listCompanies().length,
    unpaid: db.listDocuments().filter((d) => !d.paid && d.amount !== null).length,
    links: db.listLinks().length,
    dataDir: ctx.dataDir,
    dbFile: db.filePath
  }));

  ipcMain.handle('devtools:status', () => ({
    enabled: ctx.devTools.enabled,
    passwordSet: db.getSettings().devToolsPasswordHash !== null
  }));

  ipcMain.handle('devtools:enable', (_e, password: string): boolean => {
    const hash = db.getSettings().devToolsPasswordHash;
    if (!hash) return false;
    if (db.hashPassword(password) !== hash) {
      logger.warn('devtools:wrong-password');
      return false;
    }
    ctx.devTools.enabled = true;
    logger.info('devtools:enabled');
    return true;
  });

  ipcMain.handle('devtools:disable', (): boolean => {
    ctx.devTools.enabled = false;
    logger.info('devtools:disabled');
    return true;
  });

  ipcMain.handle('devtools:set-password', (_e, current: string, next: string): boolean => {
    const settings = db.getSettings();
    if (settings.devToolsPasswordHash !== null) {
      if (db.hashPassword(current) !== settings.devToolsPasswordHash) return false;
    }
    if (!next || next.length < 4) return false;
    db.setSettings({ devToolsPasswordHash: db.hashPassword(next) });
    logger.info('devtools:password-set');
    return true;
  });

  ipcMain.handle('devtools:toggle', (): boolean => {
    if (!ctx.devTools.enabled) return false;
    const win = ctx.getWindow();
    if (!win) return false;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    return true;
  });

  app.on('before-quit', () => {
    for (const [id, p] of pending) {
      fs.rmSync(p.tmpPath, { force: true });
      pending.delete(id);
    }
  });
}

import { ipcMain, dialog, BrowserWindow } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DatabaseService } from '../services/database';
import { FileStorageService } from '../services/fileStorage';
import { OcrEngineService } from '../services/ocrEngine';
import { LoggerService } from '../services/logger';
import { AppPaths, getSaltPath, getPasswordHashPath } from '../utils/paths';
import { validateId, validateFilters, validateDocumentUpdates, validateFilename, validateFileType, validateFileSize } from '../utils/validation';

interface IpcContext {
  db: DatabaseService;
  fileStorage: FileStorageService;
  ocrEngine: OcrEngineService;
  paths: AppPaths;
  getMainWindow: () => BrowserWindow | null;
  setUnlocked: (value: boolean) => void;
  getUnlocked: () => boolean;
}

let logger: LoggerService | null = null;
let encryptionKey: Buffer | null = null;

export function getEncryptionKey(): Buffer {
  if (!encryptionKey) {
    throw new Error('Encryption key not available - app is locked');
  }
  return encryptionKey;
}

function wipeEncryptionKey(): void {
  if (encryptionKey) {
    encryptionKey.fill(0);
    encryptionKey = null;
  }
}

const MAX_FILE_SIZE_MB = 100;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'tiff', 'bmp'];

export function registerIpcHandlers(context: IpcContext): void {
  const { db, fileStorage, ocrEngine, paths, getMainWindow, setUnlocked, getUnlocked } = context;

  const requireUnlocked = (): { success: false; error: string } | null => {
    if (!getUnlocked()) {
      return { success: false, error: 'locked' };
    }
    return null;
  };

  ipcMain.handle('app:unlock', async (_event, { password }: { password: string }) => {
    try {
      if (typeof password !== 'string' || password.length === 0) {
        return { success: false, error: 'Passwort erforderlich' };
      }

      const saltPath = getSaltPath(paths.configDir);
      const hashPath = getPasswordHashPath(paths.configDir);
      let salt: Buffer;

      if (!fs.existsSync(saltPath)) {
        salt = crypto.randomBytes(16);
        try {
          fs.writeFileSync(saltPath, salt, { flag: 'wx', mode: 0o600 });
        } catch {
          salt = fs.readFileSync(saltPath);
        }
        const key = crypto.scryptSync(password, salt, 32);
        fs.writeFileSync(hashPath, key, { mode: 0o600 });
        encryptionKey = key;
        setUnlocked(true);
        return { success: true };
      }

      salt = fs.readFileSync(saltPath);
      if (!fs.existsSync(hashPath)) {
        return { success: false, error: 'Kein Passwort-Hash gefunden' };
      }
      const storedHash = fs.readFileSync(hashPath);
      const key = crypto.scryptSync(password, salt, 32);

      if (storedHash.length !== key.length || !crypto.timingSafeEqual(storedHash, key)) {
        return { success: false, error: 'Falsches Passwort' };
      }

      encryptionKey = key;
      setUnlocked(true);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('app:lock', async () => {
    setUnlocked(false);
    wipeEncryptionKey();
    return { success: true };
  });

  ipcMain.handle('app:isUnlocked', async () => {
    return getUnlocked();
  });

  ipcMain.handle('dialog:openFile', async () => {
    const locked = requireUnlocked();
    if (locked) return [];

    const window = getMainWindow();
    if (!window) return [];

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Dokumente', extensions: ALLOWED_EXTENSIONS },
        { name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'bmp'] },
        { name: 'PDF', extensions: ['pdf'] },
      ],
    });

    return result.filePaths;
  });

  ipcMain.handle('file:read', async (_event, { filePath }: { filePath: string }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        return { success: false, error: 'Ungültiger Dateipfad' };
      }
      const typeError = validateFileType(filePath, ALLOWED_EXTENSIONS);
      if (typeError) {
        return { success: false, error: typeError };
      }
      const data = await fs.promises.readFile(filePath);
      const sizeError = validateFileSize(data.length, MAX_FILE_SIZE_MB);
      if (sizeError) {
        return { success: false, error: sizeError };
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('file:save', async (_event, { buffer, filename, metadata }: { buffer: ArrayBuffer; filename: string; metadata?: Record<string, unknown> }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      const nameError = validateFilename(filename);
      if (nameError) {
        return { success: false, error: nameError };
      }
      const typeError = validateFileType(filename, ALLOWED_EXTENSIONS);
      if (typeError) {
        return { success: false, error: typeError };
      }
      const data = Buffer.from(buffer);
      const sizeError = validateFileSize(data.length, MAX_FILE_SIZE_MB);
      if (sizeError) {
        return { success: false, error: sizeError };
      }
      const companyName = typeof metadata?.companyName === 'string' ? metadata.companyName : undefined;
      const result = await fileStorage.saveFile(data, filename, companyName);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('file:load', async (_event, { documentId }: { documentId: number }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      const idError = validateId(documentId, 'Dokument-ID');
      if (idError) {
        return { success: false, error: idError };
      }
      const doc = db.get('SELECT stored_filename FROM documents WHERE id = ?', [documentId]) as { stored_filename: string } | undefined;
      if (!doc) {
        return { success: false, error: 'Document not found' };
      }
      const data = await fileStorage.loadFile(doc.stored_filename);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('file:delete', async (_event, { documentId }: { documentId: number }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      const idError = validateId(documentId, 'Dokument-ID');
      if (idError) {
        return { success: false, error: idError };
      }
      const doc = db.get('SELECT stored_filename FROM documents WHERE id = ?', [documentId]) as { stored_filename: string } | undefined;
      if (!doc) {
        return { success: false, error: 'Document not found' };
      }
      db.run('DELETE FROM documents WHERE id = ?', [documentId]);
      await fileStorage.deleteFile(doc.stored_filename);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('ocr:process', async (_event, { imagePath }: { imagePath: string }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      if (typeof imagePath !== 'string' || imagePath.length === 0) {
        return { success: false, error: 'Ungültiger Pfad' };
      }
      const result = await ocrEngine.processImage(imagePath);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('ocr:visionStatus', async () => {
    const locked = requireUnlocked();
    if (locked) return locked;
    return {
      available: ocrEngine.isVisionModelAvailable(),
      downloaded: ocrEngine.isVisionModelAvailable(),
    };
  });

  ipcMain.handle('model:download', async () => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      await ocrEngine.downloadVisionModel();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('model:checkExists', async () => {
    const locked = requireUnlocked();
    if (locked) return locked;
    return ocrEngine.isVisionModelAvailable();
  });

  ipcMain.handle('db:documents:list', async (_event, filters?: Record<string, unknown>) => {
    const locked = requireUnlocked();
    if (locked) return [];
    try {
      const cleanFilters = validateFilters(filters);
      let sql = 'SELECT * FROM documents WHERE 1=1';
      const params: unknown[] = [];

      if (cleanFilters.categoryId !== undefined) {
        sql += ' AND category_id = ?';
        params.push(cleanFilters.categoryId);
      }
      if (cleanFilters.companyId !== undefined) {
        sql += ' AND company_id = ?';
        params.push(cleanFilters.companyId);
      }
      if (cleanFilters.isPaid !== undefined) {
        sql += ' AND is_paid = ?';
        params.push(cleanFilters.isPaid ? 1 : 0);
      }
      if (cleanFilters.isValidated !== undefined) {
        sql += ' AND is_validated = ?';
        params.push(cleanFilters.isValidated ? 1 : 0);
      }
      if (cleanFilters.dateFrom !== undefined) {
        sql += ' AND document_date >= ?';
        params.push(cleanFilters.dateFrom);
      }
      if (cleanFilters.dateTo !== undefined) {
        sql += ' AND document_date <= ?';
        params.push(cleanFilters.dateTo);
      }

      sql += ' ORDER BY created_at DESC';

      if (cleanFilters.limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(cleanFilters.limit);
      }

      return db.all(sql, params);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:documents:get', async (_event, { id }: { id: number }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      const idError = validateId(id, 'Dokument-ID');
      if (idError) {
        return { success: false, error: idError };
      }
      return db.get('SELECT * FROM documents WHERE id = ?', [id]);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:documents:create', async (_event, document: Record<string, unknown>) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      if (!document || typeof document !== 'object') {
        return { success: false, error: 'Ungültige Dokumentdaten' };
      }
      if (typeof document.storedFilename !== 'string' || !document.storedFilename) {
        return { success: false, error: 'storedFilename fehlt' };
      }
      if (typeof document.fileHash !== 'string' || !document.fileHash) {
        return { success: false, error: 'fileHash fehlt' };
      }

      const uuid = crypto.randomUUID();
      const result = db.run(
        `INSERT INTO documents (
          uuid, original_filename, stored_filename, file_hash, file_size, mime_type,
          ocr_text, ocr_confidence, ocr_source, detected_date, detected_amount, detected_currency,
          category_id, company_id, tags, custom_metadata, is_paid, is_validated, validation_notes, document_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          typeof document.originalFilename === 'string' ? document.originalFilename : null,
          document.storedFilename,
          document.fileHash,
          typeof document.fileSize === 'number' ? document.fileSize : null,
          typeof document.mimeType === 'string' ? document.mimeType : null,
          typeof document.ocrText === 'string' ? document.ocrText : null,
          typeof document.ocrConfidence === 'number' ? document.ocrConfidence : null,
          document.ocrSource === 'vision_fallback' ? 'vision_fallback' : 'tesseract',
          typeof document.detectedDate === 'string' ? document.detectedDate : null,
          typeof document.detectedAmount === 'number' ? document.detectedAmount : null,
          typeof document.detectedCurrency === 'string' ? document.detectedCurrency : 'EUR',
          typeof document.categoryId === 'number' ? document.categoryId : null,
          typeof document.companyId === 'number' ? document.companyId : null,
          JSON.stringify(Array.isArray(document.tags) ? document.tags : []),
          JSON.stringify(document.customMetadata && typeof document.customMetadata === 'object' ? document.customMetadata : {}),
          document.isPaid ? 1 : 0,
          document.isValidated ? 1 : 0,
          typeof document.validationNotes === 'string' ? document.validationNotes : null,
          typeof document.documentDate === 'string' ? document.documentDate : null,
        ]
      );
      return { success: true, id: result.lastInsertRowid, uuid };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:documents:update', async (_event, { id, updates }: { id: number; updates: Record<string, unknown> }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      const idError = validateId(id, 'Dokument-ID');
      if (idError) {
        return { success: false, error: idError };
      }
      const cleanUpdates = validateDocumentUpdates(updates);
      const keys = Object.keys(cleanUpdates);
      if (keys.length === 0) {
        return { success: false, error: 'Keine gültigen Felder zum Aktualisieren' };
      }

      const fields: string[] = [];
      const params: unknown[] = [];

      const fieldMap: Record<string, string> = {
        originalFilename: 'original_filename',
        ocrText: 'ocr_text',
        ocrConfidence: 'ocr_confidence',
        detectedDate: 'detected_date',
        detectedAmount: 'detected_amount',
        detectedCurrency: 'detected_currency',
        categoryId: 'category_id',
        companyId: 'company_id',
        tags: 'tags',
        customMetadata: 'custom_metadata',
        isPaid: 'is_paid',
        isValidated: 'is_validated',
        validationNotes: 'validation_notes',
        documentDate: 'document_date',
      };

      for (const [key, value] of Object.entries(cleanUpdates)) {
        const dbField = fieldMap[key];
        if (dbField) {
          fields.push(`${dbField} = ?`);
          if (key === 'tags' || key === 'customMetadata') {
            params.push(JSON.stringify(value));
          } else if (key === 'isPaid' || key === 'isValidated') {
            params.push(value ? 1 : 0);
          } else {
            params.push(value);
          }
        }
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const result = db.run(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, params);
      if (result.changes === 0) {
        return { success: false, error: 'Dokument nicht gefunden' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:documents:delete', async (_event, { id }: { id: number }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      const idError = validateId(id, 'Dokument-ID');
      if (idError) {
        return { success: false, error: idError };
      }
      const doc = db.get('SELECT stored_filename FROM documents WHERE id = ?', [id]) as { stored_filename: string } | undefined;
      if (!doc) {
        return { success: false, error: 'Dokument nicht gefunden' };
      }
      db.run('DELETE FROM documents WHERE id = ?', [id]);
      try {
        await fileStorage.deleteFile(doc.stored_filename);
      } catch (fileError) {
        logger?.warn('Datei konnte nicht gelöscht werden', fileError);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:search', async (_event, { query, filters }: { query: string; filters?: Record<string, unknown> }) => {
    const locked = requireUnlocked();
    if (locked) return [];
    try {
      if (typeof query !== 'string' || !query.trim()) {
        return [];
      }
      const cleanFilters = validateFilters(filters);

      const tokens = query
        .split(/\s+/)
        .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ''))
        .filter((t) => t.length > 0)
        .map((t) => `"${t}"`);
      if (tokens.length === 0) {
        return [];
      }
      const ftsQuery = tokens.join(' ');

      let sql = `
        SELECT d.* FROM documents d
        JOIN documents_fts fts ON d.id = fts.rowid
        WHERE documents_fts MATCH ?
      `;
      const params: unknown[] = [ftsQuery];

      if (cleanFilters.categoryId !== undefined) {
        sql += ' AND d.category_id = ?';
        params.push(cleanFilters.categoryId);
      }
      if (cleanFilters.companyId !== undefined) {
        sql += ' AND d.company_id = ?';
        params.push(cleanFilters.companyId);
      }
      if (cleanFilters.isPaid !== undefined) {
        sql += ' AND d.is_paid = ?';
        params.push(cleanFilters.isPaid ? 1 : 0);
      }
      if (cleanFilters.isValidated !== undefined) {
        sql += ' AND d.is_validated = ?';
        params.push(cleanFilters.isValidated ? 1 : 0);
      }
      if (cleanFilters.dateFrom !== undefined) {
        sql += ' AND d.document_date >= ?';
        params.push(cleanFilters.dateFrom);
      }
      if (cleanFilters.dateTo !== undefined) {
        sql += ' AND d.document_date <= ?';
        params.push(cleanFilters.dateTo);
      }

      sql += ' ORDER BY d.created_at DESC';

      return db.all(sql, params);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('settings:get', async (_event, { key }: { key: string }) => {
    const locked = requireUnlocked();
    if (locked) return null;
    try {
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
        return null;
      }
      const result = db.get('SELECT value FROM settings WHERE key = ?', [key]) as { value: string } | undefined;
      return result ? JSON.parse(result.value) : null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('settings:set', async (_event, { key, value }: { key: string; value: unknown }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(key)) {
        return { success: false, error: 'Ungültiger Schlüssel' };
      }
      db.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, JSON.stringify(value)]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('log:write', async (_event, { level, message, data }: { level: string; message: string; data?: unknown }) => {
    if (logger && typeof message === 'string') {
      switch (level) {
        case 'info': logger.info(message, data); break;
        case 'warn': logger.warn(message, data); break;
        case 'error': logger.error(message, data); break;
        case 'debug': logger.debug(message, data); break;
      }
    }
    return { success: true };
  });

  ipcMain.handle('db:categories:list', async () => {
    const locked = requireUnlocked();
    if (locked) return [];
    try {
      return db.all('SELECT * FROM categories ORDER BY name');
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:companies:list', async () => {
    const locked = requireUnlocked();
    if (locked) return [];
    try {
      return db.all('SELECT * FROM companies ORDER BY name');
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:tags:list', async () => {
    const locked = requireUnlocked();
    if (locked) return [];
    try {
      return db.all('SELECT * FROM tags ORDER BY name');
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('db:documents:findByHash', async (_event, { fileHash }: { fileHash: string }) => {
    const locked = requireUnlocked();
    if (locked) return locked;
    try {
      if (typeof fileHash !== 'string' || !fileHash) {
        return { success: false, error: 'fileHash fehlt' };
      }
      return db.get('SELECT * FROM documents WHERE file_hash = ?', [fileHash]);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}

export function setLogger(loggerService: LoggerService): void {
  logger = loggerService;
}

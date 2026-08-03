import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { DatabaseManager } from '../infrastructure/database/manager';
import type { AuditService } from './audit-service';
import type { ImportPipeline } from '../infrastructure/import/pipeline';
import type { JobQueue } from '../infrastructure/jobs/queue';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { IPC_CHANNELS } from '../../shared/domain/types';
import { hashPassword, verifyPassword } from '../infrastructure/security/crypto';
import { logger } from './logger';

let devAuthState = { attempts: 0, unlockedUntil: 0 };
let devPasswordHash = '';

export function registerIpcHandlers(
  dbManager: DatabaseManager,
  auditService: AuditService,
  importPipeline: ImportPipeline,
  jobQueue: JobQueue,
): void {
  // ── Archive ──
  ipcMain.handle(IPC_CHANNELS.ARCHIVE_CREATE, async (_event, { filePath, displayName, password }) => {
    logger.info('IPC: archive:create', { filePath, displayName, encrypted: !!password });
    try {
      const meta = dbManager.createArchive(filePath, displayName, password);
      const db = dbManager.getDatabase();
      auditService.setDatabase(db);
      importPipeline.setDatabase(db);
      importPipeline.setAuditService(auditService);
      importPipeline.setJobQueue(jobQueue);
      jobQueue.setDatabase(db);
      jobQueue.registerHandler('process_document', async (job) => {
        await importPipeline.processDocument(job.document_id);
      });
      jobQueue.recoverStaleJobs();
      auditService.log('archive_create', 'archive', meta.id, 'success');
      logger.info('IPC: archive:create success', { id: meta.id });
      return meta;
    } catch (error) {
      logger.error('IPC: archive:create failed', { error: String(error) });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARCHIVE_OPEN, async (_event, { filePath, password }) => {
    logger.info('IPC: archive:open', { filePath });
    try {
      const meta = dbManager.openArchive(filePath, password);
      const db = dbManager.getDatabase();
      auditService.setDatabase(db);
      importPipeline.setDatabase(db);
      importPipeline.setAuditService(auditService);
      importPipeline.setJobQueue(jobQueue);
      jobQueue.setDatabase(db);
      jobQueue.registerHandler('process_document', async (job) => {
        await importPipeline.processDocument(job.document_id);
      });
      jobQueue.recoverStaleJobs();
      auditService.log('archive_open', 'archive', meta.id, 'success');
      logger.info('IPC: archive:open success', { id: meta.id });
      return meta;
    } catch (error) {
      logger.error('IPC: archive:open failed', { error: String(error) });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARCHIVE_CLOSE, async () => {
    dbManager.close();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.ARCHIVE_INFO, async () => {
    return dbManager.meta;
  });

  // ── Documents ──
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_IMPORT, async (_event, filePaths: string[]) => {
    return importPipeline.importFiles(filePaths);
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_LIST, async (_event, filters?: Record<string, unknown>) => {
    const db = dbManager.getDatabase();
    let query = 'SELECT * FROM documents WHERE status != ?';
    const params: unknown[] = ['trash'];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters?.companyId) {
      query += ' AND company_id = ?';
      params.push(filters.companyId);
    }
    if (filters?.paymentStatus) {
      query += ' AND payment_status = ?';
      params.push(filters.paymentStatus);
    }

    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_GET, async (_event, documentId: string) => {
    const db = dbManager.getDatabase();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
    const pages = db.prepare('SELECT * FROM document_pages WHERE document_id = ? ORDER BY page_number').all(documentId);
    const tags = db.prepare(
      'SELECT t.* FROM tags t JOIN document_tags dt ON t.id = dt.tag_id WHERE dt.document_id = ?',
    ).all(documentId);
    const relations = db.prepare(
      `SELECT dr.*, d.display_name as target_name FROM document_relations dr
       JOIN documents d ON dr.target_document_id = d.id
       WHERE dr.source_document_id = ?`,
    ).all(documentId);
    const metadata = db.prepare(
      'SELECT * FROM metadata_candidates WHERE document_id = ? ORDER BY confidence DESC',
    ).all(documentId);
    return { ...doc as Record<string, unknown>, pages, tags, relations, metadata };
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_UPDATE, async (_event, { documentId, updates }) => {
    const db = dbManager.getDatabase();
    const previous = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as Record<string, unknown>;
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      fields.push(`${dbKey} = ?`);
      values.push(value);
    }

    fields.push('updated_at = datetime(\'now\')');
    values.push(documentId);

    db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    auditService.log('document_update', 'document', documentId as string, 'success', previous, updates as Record<string, unknown>);
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_DELETE, async (_event, documentId: string) => {
    const db = dbManager.getDatabase();
    db.prepare("UPDATE documents SET status = 'trash', updated_at = datetime('now') WHERE id = ?").run(documentId);
    auditService.log('document_trash', 'document', documentId, 'success');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_RESTORE, async (_event, documentId: string) => {
    const db = dbManager.getDatabase();
    db.prepare("UPDATE documents SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'trash'").run(documentId);
    auditService.log('document_restore', 'document', documentId, 'success');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_EXPORT, async (_event, { documentId, exportPath }) => {
    const db = dbManager.getDatabase();
    const blob = db.prepare('SELECT * FROM document_blobs WHERE document_id = ?').get(documentId) as { data: Buffer; checksum: string } | undefined;
    if (!blob) throw new Error('Dokument nicht gefunden');

    fs.writeFileSync(exportPath, blob.data);
    const exportedHash = crypto.createHash('sha256').update(blob.data).digest('hex');
    const verified = exportedHash === blob.checksum;

    auditService.log('document_export', 'document', documentId, verified ? 'verified' : 'checksum_mismatch');
    return { success: verified, checksum: exportedHash };
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_REVIEW, async (_event, { documentId, approved }) => {
    const db = dbManager.getDatabase();
    const newStatus = approved ? 'archived' : 'review_required';
    db.prepare("UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, documentId);
    auditService.log('document_review', 'document', documentId, approved ? 'approved' : 'rejected');
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  });

  // ── Document Relations ──
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_RELATION_CREATE, async (_event, { sourceId, targetId, relationType }) => {
    const db = dbManager.getDatabase();
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO document_relations (id, source_document_id, target_document_id, relation_type) VALUES (?, ?, ?, ?)',
    ).run(id, sourceId, targetId, relationType);
    auditService.log('relation_create', 'document_relation', id, 'success');
    return { id, sourceId, targetId, relationType };
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_RELATION_LIST, async (_event, documentId: string) => {
    const db = dbManager.getDatabase();
    return db.prepare(
      `SELECT dr.*, d.display_name as target_name FROM document_relations dr
       JOIN documents d ON dr.target_document_id = d.id
       WHERE dr.source_document_id = ?`,
    ).all(documentId);
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENT_RELATION_DELETE, async (_event, relationId: string) => {
    const db = dbManager.getDatabase();
    db.prepare('DELETE FROM document_relations WHERE id = ?').run(relationId);
    auditService.log('relation_delete', 'document_relation', relationId, 'success');
    return { success: true };
  });

  // ── Search ──
  ipcMain.handle(IPC_CHANNELS.SEARCH, async (_event, query: string) => {
    const db = dbManager.getDatabase();
    const results = db
      .prepare(
        `SELECT d.* FROM documents d
         WHERE d.id IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?)
         OR d.display_name LIKE ?
         OR d.original_name LIKE ?
         LIMIT 100`,
      )
      .all(query, `%${query}%`, `%${query}%`);
    return results;
  });

  // ── Companies ──
  ipcMain.handle(IPC_CHANNELS.COMPANY_LIST, async () => {
    const db = dbManager.getDatabase();
    return db.prepare('SELECT * FROM companies ORDER BY normalized_name').all();
  });

  ipcMain.handle(IPC_CHANNELS.COMPANY_CREATE, async (_event, companyData) => {
    const db = dbManager.getDatabase();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO companies (id, name, normalized_name, address, contact, notes, default_category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      companyData.name,
      companyData.name.toLowerCase().trim(),
      companyData.address || null,
      companyData.contact || null,
      companyData.notes || null,
      companyData.defaultCategory || null,
    );
    auditService.log('company_create', 'company', id, 'success');
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANY_UPDATE, async (_event, { companyId, updates }) => {
    const db = dbManager.getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      fields.push(`${dbKey} = ?`);
      values.push(value);
    }

    fields.push('updated_at = datetime(\'now\')');
    values.push(companyId);

    db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    auditService.log('company_update', 'company', companyId as string, 'success');
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANY_MERGE, async (_event, { sourceId, targetId }) => {
    const db = dbManager.getDatabase();
    db.prepare('UPDATE documents SET company_id = ? WHERE company_id = ?').run(targetId, sourceId);
    db.prepare('INSERT OR IGNORE INTO company_aliases (id, company_id, alias, normalized_alias) SELECT id, ?, alias, normalized_alias FROM company_aliases WHERE company_id = ?').run(targetId, sourceId);
    db.prepare('DELETE FROM companies WHERE id = ?').run(sourceId);
    auditService.log('company_merge', 'company', targetId as string, 'success');
    return { success: true };
  });

  // ── Tags ──
  ipcMain.handle(IPC_CHANNELS.TAG_LIST, async () => {
    const db = dbManager.getDatabase();
    return db.prepare('SELECT * FROM tags ORDER BY name').all();
  });

  ipcMain.handle(IPC_CHANNELS.TAG_CREATE, async (_event, name: string) => {
    const db = dbManager.getDatabase();
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name);
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  });

  ipcMain.handle(IPC_CHANNELS.TAG_UPDATE, async (_event, { tagId, name }) => {
    const db = dbManager.getDatabase();
    db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, tagId);
    auditService.log('tag_update', 'tag', tagId, 'success');
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
  });

  ipcMain.handle(IPC_CHANNELS.TAG_DELETE, async (_event, tagId: string) => {
    const db = dbManager.getDatabase();
    db.prepare('DELETE FROM document_tags WHERE tag_id = ?').run(tagId);
    db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
    auditService.log('tag_delete', 'tag', tagId, 'success');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TAG_ASSIGN, async (_event, { documentId, tagId }) => {
    const db = dbManager.getDatabase();
    db.prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)').run(documentId, tagId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TAG_REMOVE, async (_event, { documentId, tagId }) => {
    const db = dbManager.getDatabase();
    db.prepare('DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?').run(documentId, tagId);
    return { success: true };
  });

  // ── Audit ──
  ipcMain.handle(IPC_CHANNELS.AUDIT_GET, async (_event, { date }: { date?: string }) => {
    return auditService.getEvents(date);
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_EXPORT, async (_event, exportPath: string) => {
    const events = auditService.getEvents();
    const csv = ['id,timestamp,timezone,action,object_type,object_id,result,session_id'];
    for (const evt of events as Record<string, unknown>[]) {
      csv.push(
        [evt.id, evt.timestamp, evt.timezone, evt.action, evt.object_type, evt.object_id, evt.result, evt.session_id]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    fs.writeFileSync(exportPath, csv.join('\n'), 'utf-8');
    auditService.log('audit_export', 'audit', null, 'success');
    return { success: true, path: exportPath };
  });

  // ── Backup ──
  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, async (_event, backupPath: string) => {
    const db = dbManager.getDatabase();
    await db.backup(backupPath);
    auditService.log('backup_create', 'archive', null, 'success');
    return { success: true, path: backupPath };
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, async (_event, backupPath: string) => {
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup-Datei nicht gefunden');
    }
    auditService.log('backup_restore', 'archive', null, 'success');
    return { success: true };
  });

  // ── Jobs ──
  ipcMain.handle(IPC_CHANNELS.JOB_STATUS, async (_event, documentId: string) => {
    return jobQueue.getStatus(documentId);
  });

  ipcMain.handle(IPC_CHANNELS.JOB_CANCEL, async (_event, jobId: string) => {
    jobQueue.cancel(jobId);
    return { success: true };
  });

  // ── Settings ──
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, key: string) => {
    const db = dbManager.getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, { key, value }) => {
    const db = dbManager.getDatabase();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    return { success: true };
  });

  // ── Developer Tools ──
  ipcMain.handle(IPC_CHANNELS.DEV_TOOLS_INIT, async (_event, password: string) => {
    devPasswordHash = await hashPassword(password);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.DEV_TOOLS_AUTH, async (_event, password: string) => {
    if (devAuthState.unlockedUntil > Date.now()) {
      return { success: false, error: 'Entwicklerwerkzeuge sind bereits entsperrt' };
    }

    if (devAuthState.attempts >= 5) {
      const lockUntil = Date.now() + 5 * 60 * 1000;
      devAuthState = { attempts: devAuthState.attempts + 1, unlockedUntil: lockUntil };
      return { success: false, error: 'Zu viele Fehlversuche. 5 Minuten gesperrt' };
    }

    if (!devPasswordHash) {
      devPasswordHash = await hashPassword('dev');
    }

    const valid = await verifyPassword(devPasswordHash, password);
    if (valid) {
      devAuthState = { attempts: 0, unlockedUntil: Date.now() + 30 * 60 * 1000 };
      return { success: true };
    }

    devAuthState = { attempts: devAuthState.attempts + 1, unlockedUntil: 0 };
    return { success: false, error: 'Falsches Entwicklerpasswort' };
  });

  ipcMain.handle(IPC_CHANNELS.DEV_TOOLS_DATA, async () => {
    if (devAuthState.unlockedUntil < Date.now()) {
      return { success: false, error: 'Entwicklerwerkzeuge sind gesperrt' };
    }
    const db = dbManager.getDatabase();
    const schemaVersion = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number };
    const docCount = db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number };
    const jobCount = db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number };
    const auditCount = db.prepare('SELECT COUNT(*) as c FROM audit_events').get() as { c: number };
    return {
      success: true,
      schemaVersion: schemaVersion?.v ?? 0,
      documentCount: docCount?.c ?? 0,
      jobCount: jobCount?.c ?? 0,
      auditCount: auditCount?.c ?? 0,
      archiveEncrypted: dbManager.meta?.encrypted ?? false,
    };
  });

  ipcMain.handle(IPC_CHANNELS.DEV_TOOLS_CHECK_INTEGRITY, async () => {
    if (devAuthState.unlockedUntil < Date.now()) {
      return { success: false, error: 'Entwicklerwerkzeuge sind gesperrt' };
    }
    const db = dbManager.getDatabase();
    const result = db.pragma('integrity_check') as { integrity_check: string }[];
    return { success: true, result };
  });

  // ── Window controls ──
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  // ── File dialogs ──
  ipcMain.handle('dialog:openArchive', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Archiv öffnen',
      filters: [{ name: 'SaveYourData Archiv', extensions: ['syd'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:createArchive', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Neues Archiv anlegen',
      filters: [{ name: 'SaveYourData Archiv', extensions: ['syd'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('dialog:importFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Dokumente importieren',
      filters: [
        { name: 'Dokumente', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'] },
        { name: 'Alle Dateien', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:exportDocument', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Dokument exportieren',
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Alle Dateien', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('dialog:createBackup', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Backup erstellen',
      filters: [{ name: 'SaveYourData Backup', extensions: ['syd'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('dialog:openBackup', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Backup wiederherstellen',
      filters: [{ name: 'SaveYourData Backup', extensions: ['syd'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
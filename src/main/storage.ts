import fs from 'fs';
import path from 'path';
import type { Doc } from '../shared/types';

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function sanitizeFolderName(name: string): string {
  const clean = sanitizeFileName(name);
  return clean.length > 0 ? clean : 'Unbekannt';
}

export function buildStoredFileName(doc: Pick<Doc, 'title' | 'date' | 'amount' | 'showMetaInName'>, ext: string): string {
  let base = sanitizeFileName(doc.title) || 'Dokument';
  if (doc.showMetaInName) {
    const parts: string[] = [];
    if (doc.date) parts.push(doc.date);
    if (doc.amount !== null && doc.amount !== undefined) {
      parts.push(doc.amount.toFixed(2).replace('.', ',') + ' EUR');
    }
    if (parts.length > 0) base = `${base} [${parts.join(' - ')}]`;
  }
  return `${base}${ext}`;
}

export function uniquePath(targetPath: string): string {
  if (!fs.existsSync(targetPath)) return targetPath;
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let counter = 1;
  while (true) {
    const candidate = path.join(dir, `${base} (${counter})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    counter += 1;
  }
}

export function renameStoredFile(documentsRoot: string, doc: Doc): void {
  if (!fs.existsSync(doc.storedPath)) return;
  const ext = path.extname(doc.storedPath);
  const dir = path.dirname(doc.storedPath);
  const newName = buildStoredFileName(doc, ext);
  const target = uniquePath(path.join(dir, newName));
  if (path.resolve(target) === path.resolve(doc.storedPath)) return;
  fs.renameSync(doc.storedPath, target);
  doc.storedPath = target;
  doc.fileName = path.basename(target);
  if (doc.thumbnailPath) {
    const thumbDir = path.join(documentsRoot, '.thumbnails');
    const newThumb = path.join(thumbDir, `${doc.id}${ext}.jpg`);
    if (fs.existsSync(doc.thumbnailPath)) {
      fs.renameSync(doc.thumbnailPath, newThumb);
    }
    doc.thumbnailPath = newThumb;
  }
}

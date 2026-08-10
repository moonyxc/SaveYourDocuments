import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import type { Company, DatabaseFile, Doc, DocLink, Settings } from '../shared/types';
import type { DailyLogger } from './logger';

const DB_VERSION = 1;

function defaultSettings(): Settings {
  return {
    devToolsPasswordHash: null,
    showMetaInNameDefault: true,
    ocrLanguage: 'deu'
  };
}

function emptyData(): DatabaseFile {
  return {
    version: DB_VERSION,
    documents: [],
    companies: [],
    links: [],
    settings: defaultSettings()
  };
}

export class Database {
  readonly filePath: string;
  private data: DatabaseFile;
  private logger: DailyLogger;

  constructor(dataDir: string, logger: DailyLogger) {
    this.filePath = path.join(dataDir, 'saveyourdocuments.sydoc');
    this.logger = logger;
    this.data = this.load();
  }

  private load(): DatabaseFile {
    if (!fs.existsSync(this.filePath)) {
      this.logger.info('db:create', { file: this.filePath });
      return emptyData();
    }
    try {
      const raw = fs.readFileSync(this.filePath);
      let json: string;
      try {
        json = zlib.gunzipSync(raw).toString('utf-8');
      } catch {
        json = raw.toString('utf-8');
      }
      const parsed = JSON.parse(json) as DatabaseFile;
      const merged: DatabaseFile = {
        ...emptyData(),
        ...parsed,
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) }
      };
      this.logger.info('db:loaded', { documents: merged.documents.length, companies: merged.companies.length });
      return merged;
    } catch (err) {
      this.logger.error('db:load-failed', String(err));
      const backup = `${this.filePath}.broken-${Date.now()}`;
      try {
        fs.copyFileSync(this.filePath, backup);
        this.logger.warn('db:backup-created', { backup });
      } catch {
        // ignore
      }
      return emptyData();
    }
  }

  save(): void {
    const json = JSON.stringify(this.data);
    const compressed = zlib.gzipSync(Buffer.from(json, 'utf-8'), { level: 9 });
    fs.writeFileSync(this.filePath, compressed);
  }

  id(): string {
    return crypto.randomUUID();
  }

  hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password, 'utf-8').digest('hex');
  }

  getSettings(): Settings {
    return this.data.settings;
  }

  setSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  listDocuments(): Doc[] {
    return [...this.data.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getDocument(id: string): Doc | null {
    return this.data.documents.find((d) => d.id === id) ?? null;
  }

  insertDocument(doc: Doc): void {
    this.data.documents.push(doc);
    this.save();
  }

  updateDocument(id: string, patch: Partial<Doc>): Doc | null {
    const doc = this.getDocument(id);
    if (!doc) return null;
    Object.assign(doc, patch, { id: doc.id, updatedAt: new Date().toISOString() });
    this.save();
    return doc;
  }

  deleteDocument(id: string): Doc | null {
    const idx = this.data.documents.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    const [doc] = this.data.documents.splice(idx, 1);
    this.data.links = this.data.links.filter((l) => l.aId !== id && l.bId !== id);
    this.save();
    return doc;
  }

  listCompanies(): Company[] {
    return [...this.data.companies].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  getCompany(id: string): Company | null {
    return this.data.companies.find((c) => c.id === id) ?? null;
  }

  findCompanyByName(name: string): Company | null {
    const needle = name.trim().toLowerCase();
    return this.data.companies.find((c) => c.name.trim().toLowerCase() === needle) ?? null;
  }

  createCompany(name: string, folderPath: string): Company {
    const company: Company = {
      id: this.id(),
      name: name.trim(),
      folderPath,
      createdAt: new Date().toISOString()
    };
    this.data.companies.push(company);
    this.save();
    return company;
  }

  renameCompany(id: string, name: string): Company | null {
    const company = this.getCompany(id);
    if (!company) return null;
    company.name = name.trim();
    this.save();
    return company;
  }

  deleteCompany(id: string): boolean {
    const idx = this.data.companies.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.data.companies.splice(idx, 1);
    for (const doc of this.data.documents) {
      if (doc.companyId === id) doc.companyId = null;
    }
    this.save();
    return true;
  }

  listLinks(): DocLink[] {
    return this.data.links;
  }

  linkDocuments(aId: string, bId: string): boolean {
    if (aId === bId) return false;
    const exists = this.data.links.some(
      (l) => (l.aId === aId && l.bId === bId) || (l.aId === bId && l.bId === aId)
    );
    if (exists) return true;
    this.data.links.push({ id: this.id(), aId, bId, createdAt: new Date().toISOString() });
    this.save();
    return true;
  }

  unlinkDocuments(aId: string, bId: string): boolean {
    const before = this.data.links.length;
    this.data.links = this.data.links.filter(
      (l) => !((l.aId === aId && l.bId === bId) || (l.aId === bId && l.bId === aId))
    );
    const changed = this.data.links.length !== before;
    if (changed) this.save();
    return changed;
  }

  linkedDocumentIds(id: string): string[] {
    const ids: string[] = [];
    for (const l of this.data.links) {
      if (l.aId === id) ids.push(l.bId);
      else if (l.bId === id) ids.push(l.aId);
    }
    return ids;
  }

  allTags(): string[] {
    const set = new Set<string>();
    for (const doc of this.data.documents) {
      for (const tag of doc.tags) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }
}

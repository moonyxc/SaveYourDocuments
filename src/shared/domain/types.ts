/** Shared domain types and constants for SaveYourData */

// ── Document ──
export type DocumentStatus = 'imported' | 'processing' | 'review_required' | 'archived' | 'failed' | 'trash';

export type DocumentCategory =
  | 'insurance'
  | 'purchases'
  | 'contracts'
  | 'authorities'
  | 'finance'
  | 'health'
  | 'work_education'
  | 'correspondence'
  | 'other';

export type PaymentStatus =
  | 'not_relevant'
  | 'open'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'disputed';

export type RelationType =
  | 'reply_to'
  | 'belongs_to'
  | 'replaces'
  | 'attachment_to'
  | 'continuation_of'
  | 'duplicate_of';

export interface Document {
  id: string;
  originalName: string;
  displayName: string;
  mimeType: string;
  sha256Hash: string;
  status: DocumentStatus;
  companyId: string | null;
  category: DocumentCategory | null;
  subCategory: string | null;
  documentDate: string | null;
  documentDatePrecision: 'exact' | 'month' | 'year' | null;
  amount: number | null;
  currency: string | null;
  paymentStatus: PaymentStatus;
  dueDate: string | null;
  paymentDate: string | null;
  paidAmount: number | null;
  paymentNote: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentBlob {
  documentId: string;
  data: Buffer;
  size: number;
  checksum: string;
}

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number;
  ocrText: string;
  confidence: number;
  language: string;
  engineVersion: string;
  previewBlob: Buffer | null;
}

export interface Company {
  id: string;
  name: string;
  normalizedName: string;
  address: string | null;
  contact: string | null;
  notes: string | null;
  defaultCategory: DocumentCategory | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyAlias {
  id: string;
  companyId: string;
  alias: string;
  normalizedAlias: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export interface DocumentTag {
  documentId: string;
  tagId: string;
}

export interface DocumentRelation {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationType: RelationType;
  createdAt: string;
}

export interface MetadataCandidate {
  id: string;
  documentId: string;
  field: string;
  value: string;
  confidence: number;
  location: string | null;
  rule: string | null;
}

export interface Job {
  id: string;
  documentId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error: string | null;
  retries: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  timezone: string;
  action: string;
  objectType: string;
  objectId: string | null;
  result: string;
  sessionId: string;
  previousValues: string | null;
  newValues: string | null;
}

export interface ArchiveSettings {
  key: string;
  value: string;
}

export interface SchemaMigration {
  version: number;
  name: string;
  appliedAt: string;
}

// ── Archive ──
export interface ArchiveMeta {
  id: string;
  displayName: string;
  schemaVersion: number;
  createdAt: string;
  encrypted: boolean;
}

// ── IPC Channels ──
export const IPC_CHANNELS = {
  ARCHIVE_CREATE: 'archive:create',
  ARCHIVE_OPEN: 'archive:open',
  ARCHIVE_CLOSE: 'archive:close',
  ARCHIVE_LOCK: 'archive:lock',
  ARCHIVE_UNLOCK: 'archive:unlock',
  ARCHIVE_INFO: 'archive:info',
  DOCUMENT_IMPORT: 'document:import',
  DOCUMENT_LIST: 'document:list',
  DOCUMENT_GET: 'document:get',
  DOCUMENT_UPDATE: 'document:update',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_EXPORT: 'document:export',
  DOCUMENT_REVIEW: 'document:review',
  DOCUMENT_RESTORE: 'document:restore',
  DOCUMENT_RELATION_CREATE: 'document:relation:create',
  DOCUMENT_RELATION_LIST: 'document:relation:list',
  DOCUMENT_RELATION_DELETE: 'document:relation:delete',
  SEARCH: 'search:query',
  COMPANY_LIST: 'company:list',
  COMPANY_CREATE: 'company:create',
  COMPANY_UPDATE: 'company:update',
  COMPANY_MERGE: 'company:merge',
  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_UPDATE: 'tag:update',
  TAG_DELETE: 'tag:delete',
  TAG_ASSIGN: 'tag:assign',
  TAG_REMOVE: 'tag:remove',
  AUDIT_GET: 'audit:get',
  AUDIT_EXPORT: 'audit:export',
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  JOB_STATUS: 'job:status',
  JOB_CANCEL: 'job:cancel',
  DEV_TOOLS_INIT: 'devtools:init',
  DEV_TOOLS_AUTH: 'devtools:auth',
  DEV_TOOLS_DATA: 'devtools:data',
  DEV_TOOLS_CHECK_INTEGRITY: 'devtools:checkIntegrity',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const;

// ── Constants ──
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
] as const;

export const CONFIDENCE_THRESHOLD_HIGH = 0.90;
export const CONFIDENCE_THRESHOLD_MEDIUM = 0.65;

export const MAX_FILE_SIZE_MB = 100;
export const MAX_PAGES_PER_DOC = 500;
export const ARCHIVE_EXTENSION = '.syd';

export const UPDATE_CHECK_URL =
  'https://api.github.com/repos/vynofc/SaveYourDocuments/releases/latest';

export const DEFAULT_DISPLAY_NAME_PATTERN = '{datum} - {firma} - {typ}';
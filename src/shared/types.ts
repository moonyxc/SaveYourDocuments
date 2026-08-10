export type Category = 'versicherung' | 'kauf' | 'vertrag' | 'behoerde' | 'rechnung' | 'sonstiges';

export interface Company {
  id: string;
  name: string;
  folderPath: string;
  createdAt: string;
}

export interface DocumentMeta {
  date: string | null;
  amount: number | null;
  currency: string | null;
}

export interface Doc {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  storedPath: string;
  thumbnailPath: string | null;
  category: Category;
  companyId: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  paid: boolean;
  tags: string[];
  notes: string;
  ocrText: string;
  showMetaInName: boolean;
  validated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocLink {
  id: string;
  aId: string;
  bId: string;
  createdAt: string;
}

export interface Settings {
  devToolsPasswordHash: string | null;
  showMetaInNameDefault: boolean;
  ocrLanguage: string;
}

export interface DatabaseFile {
  version: number;
  documents: Doc[];
  companies: Company[];
  links: DocLink[];
  settings: Settings;
}

export interface ValidationSuggestion {
  id: string;
  title: string;
  fileName: string;
  category: Category;
  suggestedCompanyId: string | null;
  suggestedCompanyName: string | null;
  isNewCompany: boolean;
  date: string | null;
  amount: number | null;
  currency: string | null;
  paid: boolean;
  tags: string[];
  thumbnailDataUrl: string | null;
  ocrSnippet: string;
  notes: string;
  showMetaInName: boolean;
}

export interface ConfirmItem {
  id: string;
  title: string;
  category: Category;
  companyId: string | null;
  newCompanyName: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  paid: boolean;
  tags: string[];
  notes: string;
  showMetaInName: boolean;
}

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  details?: unknown;
}

export interface Stats {
  documents: number;
  companies: number;
  unpaid: number;
  links: number;
  dataDir: string;
  dbFile: string;
}

export interface RendererConfig {
  devToolsEnabled: boolean;
  devToolsPasswordSet: boolean;
}

export interface Api {
  getConfig(): Promise<RendererConfig>;
  importDocuments(): Promise<ValidationSuggestion[]>;
  confirmImport(items: ConfirmItem[]): Promise<{ imported: number }>;
  listDocuments(): Promise<Doc[]>;
  getDocument(id: string): Promise<Doc | null>;
  updateDocument(id: string, patch: Partial<Doc>): Promise<Doc | null>;
  deleteDocument(id: string): Promise<boolean>;
  openDocument(id: string): Promise<boolean>;
  revealDocument(id: string): Promise<boolean>;
  getDocumentData(id: string): Promise<string | null>;
  listCompanies(): Promise<Company[]>;
  createCompany(name: string): Promise<Company>;
  renameCompany(id: string, name: string): Promise<Company | null>;
  deleteCompany(id: string): Promise<boolean>;
  linkDocuments(aId: string, bId: string): Promise<boolean>;
  unlinkDocuments(aId: string, bId: string): Promise<boolean>;
  getLinks(id: string): Promise<Doc[]>;
  listTags(): Promise<string[]>;
  getLogs(date: string): Promise<LogEntry[]>;
  listLogDates(): Promise<string[]>;
  getStats(): Promise<Stats>;
  devToolsStatus(): Promise<{ enabled: boolean; passwordSet: boolean }>;
  devToolsEnable(password: string): Promise<boolean>;
  devToolsDisable(): Promise<boolean>;
  devToolsSetPassword(current: string, next: string): Promise<boolean>;
  devToolsToggle(): Promise<boolean>;
}

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'versicherung', label: 'Versicherung' },
  { value: 'kauf', label: 'Kauf' },
  { value: 'vertrag', label: 'Vertrag' },
  { value: 'behoerde', label: 'Behoerde' },
  { value: 'rechnung', label: 'Rechnung' },
  { value: 'sonstiges', label: 'Sonstiges' }
];

export const CATEGORY_LABELS: Record<Category, string> = {
  versicherung: 'Versicherung',
  kauf: 'Kauf',
  vertrag: 'Vertrag',
  behoerde: 'Behoerde',
  rechnung: 'Rechnung',
  sonstiges: 'Sonstiges'
};

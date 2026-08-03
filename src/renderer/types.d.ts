/// <reference types="react" />

interface ElectronAPI {
  archive: {
    create: (filePath: string, displayName: string, password?: string) => Promise<{ id: string; displayName: string; schemaVersion: number; createdAt: string; encrypted: boolean }>;
    open: (filePath: string, password?: string) => Promise<{ id: string; displayName: string; schemaVersion: number; createdAt: string; encrypted: boolean }>;
    close: () => Promise<{ success: boolean }>;
    info: () => Promise<{ id: string; displayName: string; schemaVersion: number; createdAt: string; encrypted: boolean } | null>;
  };
  documents: {
    import: (filePaths: string[]) => Promise<{ filePath: string; success: boolean; documentId?: string; hash?: string; error?: string }[]>;
    list: (filters?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    get: (documentId: string) => Promise<Record<string, unknown> | null>;
    update: (documentId: string, updates: Record<string, unknown>) => Promise<Record<string, unknown>>;
    delete: (documentId: string) => Promise<{ success: boolean }>;
    restore: (documentId: string) => Promise<{ success: boolean }>;
    export: (documentId: string, exportPath: string) => Promise<{ success: boolean; checksum: string }>;
    review: (documentId: string, approved: boolean) => Promise<Record<string, unknown>>;
    relations: {
      create: (sourceId: string, targetId: string, relationType: string) => Promise<Record<string, unknown>>;
      list: (documentId: string) => Promise<Record<string, unknown>[]>;
      delete: (relationId: string) => Promise<{ success: boolean }>;
    };
  };
  search: (query: string) => Promise<Record<string, unknown>[]>;
  companies: {
    list: () => Promise<Record<string, unknown>[]>;
    create: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (companyId: string, updates: Record<string, unknown>) => Promise<Record<string, unknown>>;
    merge: (sourceId: string, targetId: string) => Promise<{ success: boolean }>;
  };
  tags: {
    list: () => Promise<Record<string, unknown>[]>;
    create: (name: string) => Promise<Record<string, unknown>>;
    update: (tagId: string, name: string) => Promise<Record<string, unknown>>;
    delete: (tagId: string) => Promise<{ success: boolean }>;
    assign: (documentId: string, tagId: string) => Promise<{ success: boolean }>;
    remove: (documentId: string, tagId: string) => Promise<{ success: boolean }>;
  };
  audit: {
    get: (date?: string) => Promise<Record<string, unknown>[]>;
    export: (exportPath: string) => Promise<{ success: boolean; path: string }>;
  };
  backup: {
    create: (backupPath: string) => Promise<{ success: boolean; path: string }>;
    restore: (backupPath: string) => Promise<{ success: boolean }>;
  };
  jobs: {
    status: (documentId: string) => Promise<Record<string, unknown> | null>;
    cancel: (jobId: string) => Promise<{ success: boolean }>;
  };
  devtools: {
    init: (password: string) => Promise<{ success: boolean }>;
    auth: (password: string) => Promise<{ success: boolean; error?: string }>;
    data: () => Promise<{ success: boolean; error?: string; schemaVersion?: number; documentCount?: number; jobCount?: number; auditCount?: number; archiveEncrypted?: boolean }>;
    checkIntegrity: () => Promise<{ success: boolean; error?: string; result?: { integrity_check: string }[] }>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<{ success: boolean }>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  dialog: {
    openArchive: () => Promise<string | null>;
    createArchive: () => Promise<string | null>;
    importFiles: () => Promise<string[]>;
    exportDocument: () => Promise<string | null>;
    createBackup: () => Promise<string | null>;
    openBackup: () => Promise<string | null>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export type { ElectronAPI };
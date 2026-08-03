import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/domain/types';

const electronAPI = {
  archive: {
    create: (filePath: string, displayName: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ARCHIVE_CREATE, { filePath, displayName, password }),
    open: (filePath: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ARCHIVE_OPEN, { filePath, password }),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.ARCHIVE_CLOSE),
    info: () => ipcRenderer.invoke(IPC_CHANNELS.ARCHIVE_INFO),
  },
  documents: {
    import: (filePaths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_IMPORT, filePaths),
    list: (filters?: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_LIST, filters),
    get: (documentId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_GET, documentId),
    update: (documentId: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_UPDATE, { documentId, updates }),
    delete: (documentId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_DELETE, documentId),
    restore: (documentId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_RESTORE, documentId),
    export: (documentId: string, exportPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_EXPORT, { documentId, exportPath }),
    review: (documentId: string, approved: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_REVIEW, { documentId, approved }),
    relations: {
      create: (sourceId: string, targetId: string, relationType: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_RELATION_CREATE, { sourceId, targetId, relationType }),
      list: (documentId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_RELATION_LIST, documentId),
      delete: (relationId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT_RELATION_DELETE, relationId),
    },
  },
  search: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH, query),
  companies: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.COMPANY_LIST),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.COMPANY_CREATE, data),
    update: (companyId: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.COMPANY_UPDATE, { companyId, updates }),
    merge: (sourceId: string, targetId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.COMPANY_MERGE, { sourceId, targetId }),
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.TAG_LIST),
    create: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.TAG_CREATE, name),
    update: (tagId: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.TAG_UPDATE, { tagId, name }),
    delete: (tagId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAG_DELETE, tagId),
    assign: (documentId: string, tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAG_ASSIGN, { documentId, tagId }),
    remove: (documentId: string, tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAG_REMOVE, { documentId, tagId }),
  },
  audit: {
    get: (date?: string) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_GET, { date }),
    export: (exportPath: string) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_EXPORT, exportPath),
  },
  backup: {
    create: (backupPath: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, backupPath),
    restore: (backupPath: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, backupPath),
  },
  jobs: {
    status: (documentId: string) => ipcRenderer.invoke(IPC_CHANNELS.JOB_STATUS, documentId),
    cancel: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.JOB_CANCEL, jobId),
  },
  devtools: {
    init: (password: string) => ipcRenderer.invoke(IPC_CHANNELS.DEV_TOOLS_INIT, password),
    auth: (password: string) => ipcRenderer.invoke(IPC_CHANNELS.DEV_TOOLS_AUTH, password),
    data: () => ipcRenderer.invoke(IPC_CHANNELS.DEV_TOOLS_DATA),
    checkIntegrity: () => ipcRenderer.invoke(IPC_CHANNELS.DEV_TOOLS_CHECK_INTEGRITY),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value }),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  },
  dialog: {
    openArchive: () => ipcRenderer.invoke('dialog:openArchive'),
    createArchive: () => ipcRenderer.invoke('dialog:createArchive'),
    importFiles: () => ipcRenderer.invoke('dialog:importFiles'),
    exportDocument: () => ipcRenderer.invoke('dialog:exportDocument'),
    createBackup: () => ipcRenderer.invoke('dialog:createBackup'),
    openBackup: () => ipcRenderer.invoke('dialog:openBackup'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
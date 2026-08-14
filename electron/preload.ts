import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronApi {
  unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => Promise<{ success: boolean }>;
  isUnlocked: () => Promise<boolean>;

  openFileDialog: () => Promise<string[]>;
  readFile: (filePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>;
  saveFile: (data: { buffer: ArrayBuffer; filename: string; metadata?: Record<string, unknown> }) => Promise<{ success: boolean; storedFilename?: string; fileHash?: string; fileSize?: number; mimeType?: string; error?: string }>;

  documents: {
    list: (filters?: Record<string, unknown>) => Promise<unknown[]>;
    get: (id: number) => Promise<unknown>;
    create: (doc: Record<string, unknown>) => Promise<{ success: boolean; id?: number; uuid?: string; error?: string }>;
    update: (id: number, updates: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
    delete: (id: number) => Promise<{ success: boolean; error?: string }>;
  };

  search: (query: string, filters?: Record<string, unknown>) => Promise<unknown[]>;

  ocr: {
    process: (path: string) => Promise<{ success: boolean; text?: string; confidence?: number; source?: string; date?: string; amount?: number; currency?: string; error?: string }>;
    onProgress: (callback: (data: { jobId: string; progress: number }) => void) => () => void;
    visionStatus: () => Promise<{ available: boolean; downloaded: boolean }>;
  };

  model: {
    download: () => Promise<{ success: boolean; error?: string }>;
    onDownloadProgress: (callback: (data: { percent: number; eta: string }) => void) => () => void;
    checkExists: () => Promise<boolean>;
  };

  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
  };

  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => Promise<{ success: boolean }>;
}

const api: ElectronApi = {
  unlock: (password: string) => ipcRenderer.invoke('app:unlock', { password }),
  lock: () => ipcRenderer.invoke('app:lock'),
  isUnlocked: () => ipcRenderer.invoke('app:isUnlocked'),

  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', { filePath }),
  saveFile: (data) => ipcRenderer.invoke('file:save', data),

  documents: {
    list: (filters) => ipcRenderer.invoke('db:documents:list', filters),
    get: (id) => ipcRenderer.invoke('db:documents:get', { id }),
    create: (doc) => ipcRenderer.invoke('db:documents:create', doc),
    update: (id, updates) => ipcRenderer.invoke('db:documents:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('db:documents:delete', { id }),
  },

  search: (query, filters) => ipcRenderer.invoke('db:search', { query, filters }),

  ocr: {
    process: (path) => ipcRenderer.invoke('ocr:process', { imagePath: path }),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { jobId: string; progress: number }) => callback(data);
      ipcRenderer.on('ocr:progress', listener);
      return () => ipcRenderer.removeListener('ocr:progress', listener);
    },
    visionStatus: () => ipcRenderer.invoke('ocr:visionStatus'),
  },

  model: {
    download: () => ipcRenderer.invoke('model:download'),
    onDownloadProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { percent: number; eta: string }) => callback(data);
      ipcRenderer.on('model:downloadProgress', listener);
      return () => ipcRenderer.removeListener('model:downloadProgress', listener);
    },
    checkExists: () => ipcRenderer.invoke('model:checkExists'),
  },

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', { key }),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  },

  log: (level, message, data) => ipcRenderer.invoke('log:write', { level, message, data }),
};

contextBridge.exposeInMainWorld('api', api);

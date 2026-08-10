import { contextBridge, ipcRenderer } from 'electron';
import type { Api, ConfirmItem, Doc } from '../shared/types';

const api: Api = {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  importDocuments: () => ipcRenderer.invoke('docs:import'),
  confirmImport: (items: ConfirmItem[]) => ipcRenderer.invoke('docs:confirm-import', items),
  listDocuments: () => ipcRenderer.invoke('docs:list'),
  getDocument: (id: string) => ipcRenderer.invoke('docs:get', id),
  updateDocument: (id: string, patch: Partial<Doc>) => ipcRenderer.invoke('docs:update', id, patch),
  deleteDocument: (id: string) => ipcRenderer.invoke('docs:delete', id),
  openDocument: (id: string) => ipcRenderer.invoke('docs:open', id),
  revealDocument: (id: string) => ipcRenderer.invoke('docs:reveal', id),
  getDocumentData: (id: string) => ipcRenderer.invoke('docs:get-data', id),
  listCompanies: () => ipcRenderer.invoke('companies:list'),
  createCompany: (name: string) => ipcRenderer.invoke('companies:create', name),
  renameCompany: (id: string, name: string) => ipcRenderer.invoke('companies:rename', id, name),
  deleteCompany: (id: string) => ipcRenderer.invoke('companies:delete', id),
  linkDocuments: (aId: string, bId: string) => ipcRenderer.invoke('links:link', aId, bId),
  unlinkDocuments: (aId: string, bId: string) => ipcRenderer.invoke('links:unlink', aId, bId),
  getLinks: (id: string) => ipcRenderer.invoke('links:for', id),
  listTags: () => ipcRenderer.invoke('tags:list'),
  getLogs: (date: string) => ipcRenderer.invoke('logs:get', date),
  listLogDates: () => ipcRenderer.invoke('logs:list-dates'),
  getStats: () => ipcRenderer.invoke('stats:get'),
  devToolsStatus: () => ipcRenderer.invoke('devtools:status'),
  devToolsEnable: (password: string) => ipcRenderer.invoke('devtools:enable', password),
  devToolsDisable: () => ipcRenderer.invoke('devtools:disable'),
  devToolsSetPassword: (current: string, next: string) =>
    ipcRenderer.invoke('devtools:set-password', current, next),
  devToolsToggle: () => ipcRenderer.invoke('devtools:toggle')
};

contextBridge.exposeInMainWorld('api', api);

import { contextBridge, ipcRenderer } from 'electron';

// IPC channels inlined — sandboxed preloads cannot require() local files
const IPC = {
  STORAGE_SAVE: 'storage:saveEntry',
  STORAGE_LOAD: 'storage:loadEntry',
  STORAGE_LOAD_ALL: 'storage:loadAllEntries',
  STORAGE_DELETE: 'storage:deleteEntry',
  BACKUP_SAVE: 'backup:saveBackup',
  BACKUP_IMPORT: 'backup:importBackup',
} as const;

const api = {
  storage: {
    saveEntry: (date: string, data: string) =>
      ipcRenderer.invoke(IPC.STORAGE_SAVE, date, data),
    loadEntry: (date: string) =>
      ipcRenderer.invoke(IPC.STORAGE_LOAD, date),
    loadAllEntries: () =>
      ipcRenderer.invoke(IPC.STORAGE_LOAD_ALL),
    deleteEntry: (date: string) =>
      ipcRenderer.invoke(IPC.STORAGE_DELETE, date),
  },
  backup: {
    saveBackup: (content: string, defaultFilename: string) =>
      ipcRenderer.invoke(IPC.BACKUP_SAVE, content, defaultFilename),
    importBackup: () =>
      ipcRenderer.invoke(IPC.BACKUP_IMPORT),
  },
  platform: 'electron' as const,
};

contextBridge.exposeInMainWorld('electronAPI', api);

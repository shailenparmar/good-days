import { contextBridge, ipcRenderer } from 'electron';
import { IPC, ElectronAPI } from './types';

const api: ElectronAPI = {
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
  platform: 'electron',
};

contextBridge.exposeInMainWorld('electronAPI', api);

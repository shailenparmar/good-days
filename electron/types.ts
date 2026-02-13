export const IPC = {
  STORAGE_SAVE: 'storage:saveEntry',
  STORAGE_LOAD: 'storage:loadEntry',
  STORAGE_LOAD_ALL: 'storage:loadAllEntries',
  STORAGE_DELETE: 'storage:deleteEntry',
  BACKUP_SAVE: 'backup:saveBackup',
  BACKUP_IMPORT: 'backup:importBackup',
} as const;

export interface ElectronAPI {
  storage: {
    saveEntry(date: string, data: string): Promise<void>;
    loadEntry(date: string): Promise<string | null>;
    loadAllEntries(): Promise<Array<{ date: string; data: string }>>;
    deleteEntry(date: string): Promise<boolean>;
  };
  backup: {
    saveBackup(content: string, defaultFilename: string): Promise<boolean>;
    importBackup(): Promise<string | null>;
  };
  platform: 'electron';
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

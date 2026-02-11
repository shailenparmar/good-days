interface Window {
  electronAPI?: {
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
  };
}

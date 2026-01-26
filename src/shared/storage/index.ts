// Storage abstraction - uses Electron file system when available, falls back to localStorage

interface ElectronAPI {
  loadData: () => Promise<Record<string, unknown> | null>;
  saveData: (data: Record<string, unknown>) => Promise<boolean>;
  getDataPath: () => Promise<string>;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// Check if running in Electron
export const isElectron = (): boolean => {
  return !!(window.electronAPI?.isElectron);
};

// In-memory cache for Electron mode
let dataCache: Record<string, unknown> = {};
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// Initialize storage - load all data from file
export const initStorage = async (): Promise<void> => {
  if (isElectron()) {
    const data = await window.electronAPI!.loadData();
    if (data) {
      dataCache = data;
    }
  }
};

// Get item from storage
export const getItem = (key: string): string | null => {
  if (isElectron()) {
    const value = dataCache[key];
    return value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : null;
  }
  return localStorage.getItem(key);
};

// Set item in storage
export const setItem = (key: string, value: string): void => {
  if (isElectron()) {
    // Try to parse as JSON, otherwise store as string
    try {
      dataCache[key] = JSON.parse(value);
    } catch {
      dataCache[key] = value;
    }

    // Debounce saves to avoid too many file writes
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      window.electronAPI!.saveData(dataCache);
    }, 500);
  } else {
    localStorage.setItem(key, value);
  }
};

// Remove item from storage
export const removeItem = (key: string): void => {
  if (isElectron()) {
    delete dataCache[key];
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      window.electronAPI!.saveData(dataCache);
    }, 500);
  } else {
    localStorage.removeItem(key);
  }
};

// Force save (useful before app closes)
export const forceSave = async (): Promise<void> => {
  if (isElectron()) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    await window.electronAPI!.saveData(dataCache);
  }
};

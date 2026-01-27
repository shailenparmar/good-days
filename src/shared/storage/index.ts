// Storage abstraction - uses Electron file system, IndexedDB, or localStorage

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

// In-memory cache for both Electron and IndexedDB modes
let dataCache: Record<string, unknown> = {};
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let dbInstance: IDBDatabase | null = null;
let storageInitialized = false;

const DB_NAME = 'gooddays';
const DB_VERSION = 1;
const STORE_NAME = 'storage';

// Open IndexedDB connection
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// Load all data from IndexedDB into cache
async function loadFromIndexedDB(): Promise<Record<string, unknown>> {
  const db = await openDB();
  dbInstance = db;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    const keysRequest = store.getAllKeys();

    const result: Record<string, unknown> = {};

    transaction.oncomplete = () => {
      const keys = keysRequest.result as string[];
      const values = request.result;
      keys.forEach((key, i) => {
        result[key] = values[i];
      });
      resolve(result);
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

// Save all data to IndexedDB
async function saveToIndexedDB(data: Record<string, unknown>): Promise<void> {
  if (!dbInstance) {
    dbInstance = await openDB();
  }

  return new Promise((resolve, reject) => {
    const transaction = dbInstance!.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Clear and rewrite all data
    store.clear();
    Object.entries(data).forEach(([key, value]) => {
      store.put(value, key);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Migrate from localStorage to IndexedDB (one-time)
async function migrateFromLocalStorage(): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  // Keys we care about
  const keys = ['journalEntries', 'selectedDate', 'lastTypedTime', 'isScrambled',
                'colorway', 'totalKeystrokes', 'totalSecondsOnApp', 'passwordHash'];

  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  }

  // Save to IndexedDB
  if (Object.keys(data).length > 0) {
    await saveToIndexedDB(data);
    // Mark migration complete
    localStorage.setItem('migratedToIndexedDB', 'true');
  }

  return data;
}

// Check if IndexedDB is available
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

// Initialize storage - load all data
export const initStorage = async (): Promise<void> => {
  if (storageInitialized) return;

  if (isElectron()) {
    // Electron mode - use file system
    const data = await window.electronAPI!.loadData();
    if (data) {
      dataCache = data;
    }
  } else if (isIndexedDBAvailable()) {
    // Browser mode - use IndexedDB
    try {
      // Check if we need to migrate from localStorage
      const migrated = localStorage.getItem('migratedToIndexedDB');
      if (!migrated) {
        dataCache = await migrateFromLocalStorage();
      } else {
        dataCache = await loadFromIndexedDB();
      }
    } catch (error) {
      console.error('IndexedDB failed, falling back to localStorage:', error);
      // Fall back to localStorage if IndexedDB fails
    }
  }

  storageInitialized = true;
};

// Debounced save to IndexedDB
function scheduleSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    if (isElectron()) {
      window.electronAPI!.saveData(dataCache);
    } else if (isIndexedDBAvailable() && dbInstance) {
      saveToIndexedDB(dataCache).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });
    }
  }, 500);
}

// Get item from storage
export const getItem = (key: string): string | null => {
  if (isElectron() || (isIndexedDBAvailable() && storageInitialized)) {
    const value = dataCache[key];
    if (value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  // Fallback to localStorage
  return localStorage.getItem(key);
};

// Set item in storage
export const setItem = (key: string, value: string): void => {
  if (isElectron() || (isIndexedDBAvailable() && storageInitialized)) {
    // Try to parse as JSON, otherwise store as string
    try {
      dataCache[key] = JSON.parse(value);
    } catch {
      dataCache[key] = value;
    }
    scheduleSave();
  } else {
    // Fallback to localStorage
    localStorage.setItem(key, value);
  }
};

// Remove item from storage
export const removeItem = (key: string): void => {
  if (isElectron() || (isIndexedDBAvailable() && storageInitialized)) {
    delete dataCache[key];
    scheduleSave();
  } else {
    localStorage.removeItem(key);
  }
};

// Force save (useful before app closes)
export const forceSave = async (): Promise<void> => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  if (isElectron()) {
    await window.electronAPI!.saveData(dataCache);
  } else if (isIndexedDBAvailable() && dbInstance) {
    await saveToIndexedDB(dataCache);
  }
};

// Check if storage is ready
export const isStorageReady = (): boolean => {
  return storageInitialized;
};

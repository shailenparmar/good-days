// IndexedDB storage for journal entries
// Provides effectively unlimited storage compared to localStorage's 5MB limit

import type { JournalEntry } from '@features/journal/types';

const DB_NAME = 'good-days';
const DB_VERSION = 1;
const ENTRIES_STORE = 'entries';
const METADATA_STORE = 'metadata';

// Track if we're in fallback mode (IndexedDB failed, using localStorage)
let fallbackMode = false;

// Open the IndexedDB database
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create entries store with date as keyPath
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        db.createObjectStore(ENTRIES_STORE, { keyPath: 'date' });
      }

      // Create metadata store for migration tracking
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
    };
  });
}

// Validate a single journal entry
function isValidEntry(entry: unknown): entry is JournalEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
  if (typeof e.content !== 'string') return false;
  if (e.title !== undefined && typeof e.title !== 'string') return false;
  if (e.startedAt !== undefined && typeof e.startedAt !== 'number') return false;
  if (e.lastModified !== undefined && typeof e.lastModified !== 'number') return false;
  return true;
}

// Parse and validate entries from localStorage
function parseLocalStorageEntries(): JournalEntry[] {
  const saved = localStorage.getItem('journalEntries');
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    console.error('Failed to parse localStorage journal entries');
    return [];
  }
}

// Get all entries from IndexedDB
async function getEntriesFromIndexedDB(db: IDBDatabase): Promise<JournalEntry[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const entries = request.result.filter(isValidEntry);
      // Sort by date descending (newest first)
      entries.sort((a, b) => b.date.localeCompare(a.date));
      resolve(entries);
    };
  });
}

// Write all entries to IndexedDB
async function writeEntriesToIndexedDB(db: IDBDatabase, entries: JournalEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
    const store = transaction.objectStore(ENTRIES_STORE);

    // Clear existing entries first
    const clearRequest = store.clear();
    clearRequest.onerror = () => reject(clearRequest.error);

    clearRequest.onsuccess = () => {
      // Add all entries
      let completed = 0;
      const total = entries.length;

      if (total === 0) {
        resolve();
        return;
      }

      for (const entry of entries) {
        const addRequest = store.put(entry);
        addRequest.onerror = () => reject(addRequest.error);
        addRequest.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };
      }
    };
  });
}

// Check if migration has been done
async function hasMigrated(db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get('migrated');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result?.value === true);
    };
  });
}

// Mark migration as complete
async function markMigrated(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.put({ key: 'migrated', value: true });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Merge localStorage backup with IndexedDB entries
 * localStorage entries take precedence (they're from beforeunload, potentially newer)
 */
function mergeEntries(indexedDBEntries: JournalEntry[], localStorageEntries: JournalEntry[]): JournalEntry[] {
  // Create a map of IndexedDB entries by date
  const entriesByDate = new Map<string, JournalEntry>();
  for (const entry of indexedDBEntries) {
    entriesByDate.set(entry.date, entry);
  }

  // Merge localStorage entries (prefer localStorage if lastModified is newer or equal)
  for (const lsEntry of localStorageEntries) {
    const idbEntry = entriesByDate.get(lsEntry.date);
    if (!idbEntry) {
      // Entry only in localStorage - add it
      entriesByDate.set(lsEntry.date, lsEntry);
    } else {
      // Entry in both - prefer the one with newer lastModified
      const lsModified = lsEntry.lastModified || 0;
      const idbModified = idbEntry.lastModified || 0;
      if (lsModified >= idbModified) {
        entriesByDate.set(lsEntry.date, lsEntry);
      }
    }
  }

  // Convert back to sorted array
  const merged = Array.from(entriesByDate.values());
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged;
}

/**
 * Initialize journal storage
 * - Opens IndexedDB
 * - Migrates from localStorage if needed
 * - Merges any localStorage backup (from beforeunload) with IndexedDB
 * - Returns all entries
 *
 * Falls back to localStorage if IndexedDB fails
 */
export async function initJournalStorage(): Promise<JournalEntry[]> {
  try {
    const db = await openDatabase();

    // Check if we need to migrate from localStorage
    const localStorageEntries = parseLocalStorageEntries();
    const alreadyMigrated = await hasMigrated(db);

    if (localStorageEntries.length > 0 && !alreadyMigrated) {
      // Migration needed: localStorage has entries and we haven't migrated
      console.log(`Migrating ${localStorageEntries.length} entries from localStorage to IndexedDB...`);

      // Write to IndexedDB
      await writeEntriesToIndexedDB(db, localStorageEntries);

      // Verify the write
      const verifiedEntries = await getEntriesFromIndexedDB(db);
      if (verifiedEntries.length !== localStorageEntries.length) {
        throw new Error(`Migration verification failed: expected ${localStorageEntries.length}, got ${verifiedEntries.length}`);
      }

      // Mark as migrated and delete from localStorage
      await markMigrated(db);
      localStorage.removeItem('journalEntries');
      console.log('Migration complete, localStorage cleared');

      db.close();
      return verifiedEntries;
    }

    // Load from IndexedDB
    const indexedDBEntries = await getEntriesFromIndexedDB(db);

    // Check for localStorage backup (from beforeunload) and merge if present
    // This handles the case where IndexedDB async write didn't complete before tab close
    if (localStorageEntries.length > 0 && alreadyMigrated) {
      const mergedEntries = mergeEntries(indexedDBEntries, localStorageEntries);

      // If merge changed anything, update IndexedDB and clear localStorage
      if (mergedEntries.length !== indexedDBEntries.length ||
          mergedEntries.some((e, i) => e.lastModified !== indexedDBEntries[i]?.lastModified)) {
        console.log('Merging localStorage backup with IndexedDB...');
        await writeEntriesToIndexedDB(db, mergedEntries);
        localStorage.removeItem('journalEntries');
        db.close();
        return mergedEntries;
      }

      // No changes needed, but still clear stale localStorage
      localStorage.removeItem('journalEntries');
    }

    db.close();
    return indexedDBEntries;
  } catch (error) {
    console.error('IndexedDB failed, falling back to localStorage:', error);
    fallbackMode = true;
    return parseLocalStorageEntries();
  }
}

/**
 * Save all journal entries to IndexedDB
 * Fire-and-forget async - doesn't block the caller
 * Falls back to localStorage if IndexedDB failed
 */
export function saveAllJournalEntries(entries: JournalEntry[]): void {
  if (fallbackMode) {
    // Fallback: use localStorage
    localStorage.setItem('journalEntries', JSON.stringify(entries));
    return;
  }

  // Fire-and-forget IndexedDB write
  (async () => {
    try {
      const db = await openDatabase();
      await writeEntriesToIndexedDB(db, entries);
      db.close();
    } catch (error) {
      console.error('Failed to save to IndexedDB, falling back to localStorage:', error);
      fallbackMode = true;
      localStorage.setItem('journalEntries', JSON.stringify(entries));
    }
  })();
}

/**
 * Get storage estimate using the Storage API
 * Returns { used, quota } in bytes
 */
export async function getStorageEstimate(): Promise<{ used: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    } catch {
      // Fall through to default
    }
  }

  // Fallback: estimate localStorage usage
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key) || '';
      totalBytes += new Blob([key + value]).size;
    }
  }

  return {
    used: totalBytes,
    quota: 5 * 1024 * 1024 // 5MB localStorage limit
  };
}

/**
 * Check if we're in fallback mode (using localStorage instead of IndexedDB)
 */
export function isInFallbackMode(): boolean {
  return fallbackMode;
}

/**
 * Clear all journal data from IndexedDB (for reset functionality)
 */
export async function clearJournalStorage(): Promise<void> {
  if (fallbackMode) {
    localStorage.removeItem('journalEntries');
    return;
  }

  try {
    const db = await openDatabase();

    // Clear entries store
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
      const store = transaction.objectStore(ENTRIES_STORE);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Clear metadata store
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    db.close();
  } catch (error) {
    console.error('Failed to clear IndexedDB:', error);
    // Also try to clear localStorage as fallback
    localStorage.removeItem('journalEntries');
  }
}

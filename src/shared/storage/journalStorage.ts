// IndexedDB storage for journal entries
// Provides effectively unlimited storage compared to localStorage's 5MB limit
// Entries are encrypted at rest (AES-GCM) — app-secret key or password-derived key

import type { JournalEntry } from '@features/journal/types';
import { logAction } from '@shared/logger';
import { encryptWithKey, decryptWithKey } from '@shared/crypto';

const DB_NAME = 'good-days';
const DB_VERSION = 1;
const ENTRIES_STORE = 'entries';
const METADATA_STORE = 'metadata';

// Track if we're in fallback mode (IndexedDB failed, using localStorage)
let fallbackMode = false;

// --- Encryption state ---

let currentKey: CryptoKey | null = null;
let keyMode: 'app' | 'password' = 'app';

// Set the active encryption key (called by auth layer)
export function setEncryptionKey(key: CryptoKey, mode: 'app' | 'password'): void {
  currentKey = key;
  keyMode = mode;
}

// Get the encryption mode from IndexedDB metadata
export async function getEncryptionMode(): Promise<'app' | 'password' | 'none'> {
  try {
    const db = await openDatabase();
    const result = await new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get('encryptionMode');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value ?? null);
    });
    db.close();
    return (result as 'app' | 'password') || 'none';
  } catch {
    return 'none';
  }
}

// Set the encryption mode in IndexedDB metadata
async function setEncryptionMode(db: IDBDatabase, mode: 'app' | 'password'): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.put({ key: 'encryptionMode', value: mode });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// --- Encrypt/decrypt entry helpers ---

// Encrypted record shape in IndexedDB
interface EncryptedRecord {
  date: string;
  _enc: 'app' | 'password';
  _payload: string; // base64 AES-GCM ciphertext of JSON { content, title }
  startedAt?: number;
  lastModified?: number;
}

async function encryptEntry(entry: JournalEntry): Promise<EncryptedRecord> {
  if (!currentKey) throw new Error('No encryption key set');
  const payload = JSON.stringify({ content: entry.content, title: entry.title });
  const encrypted = await encryptWithKey(payload, currentKey);
  return {
    date: entry.date,
    _enc: keyMode,
    _payload: encrypted,
    startedAt: entry.startedAt,
    lastModified: entry.lastModified,
  };
}

async function decryptEntry(record: unknown): Promise<JournalEntry | null> {
  if (typeof record !== 'object' || record === null) return null;
  const r = record as Record<string, unknown>;

  // Legacy plaintext entry (no _enc marker)
  if (!r._enc) {
    return isValidEntry(record) ? (record as JournalEntry) : null;
  }

  // Encrypted entry
  if (typeof r._payload !== 'string' || typeof r.date !== 'string') return null;
  if (!currentKey) return null;

  try {
    const decrypted = await decryptWithKey(r._payload, currentKey);
    const { content, title } = JSON.parse(decrypted);
    const entry: JournalEntry = {
      date: r.date,
      content: content ?? '',
      title,
      startedAt: typeof r.startedAt === 'number' ? r.startedAt : undefined,
      lastModified: typeof r.lastModified === 'number' ? r.lastModified : undefined,
    };
    return isValidEntry(entry) ? entry : null;
  } catch {
    log('decryptEntry: failed to decrypt', { date: r.date });
    return null;
  }
}

// Re-encrypt all entries with a new key (called during password transitions)
export async function reEncryptAllEntries(newKey: CryptoKey, newMode: 'app' | 'password'): Promise<void> {
  if (fallbackMode) return; // Skip encryption in fallback mode

  const db = await openDatabase();

  // Read all raw records
  const rawRecords = await new Promise<unknown[]>((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  // Decrypt all with current key
  const entries = (await Promise.all(rawRecords.map(r => decryptEntry(r)))).filter(
    (e): e is JournalEntry => e !== null
  );

  // Switch to new key
  const oldKey = currentKey;
  const oldMode = keyMode;
  currentKey = newKey;
  keyMode = newMode;

  try {
    // Re-encrypt all with new key
    const encrypted = await Promise.all(entries.map(e => encryptEntry(e)));

    // Write back atomically
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
      const store = transaction.objectStore(ENTRIES_STORE);
      let completed = 0;
      if (encrypted.length === 0) { resolve(); return; }
      for (const record of encrypted) {
        const request = store.put(record);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          completed++;
          if (completed === encrypted.length) resolve();
        };
      }
    });

    // Update metadata
    await setEncryptionMode(db, newMode);
    db.close();
    log('reEncryptAllEntries: done', { count: entries.length, mode: newMode });
    logAction('storage.reencrypt', { count: entries.length, mode: newMode });
  } catch (error) {
    // Rollback key on failure
    currentKey = oldKey;
    keyMode = oldMode;
    db.close();
    throw error;
  }
}

// Multi-tab sync via BroadcastChannel
const TAB_ID = Math.random().toString(36).slice(2);
let syncChannel: BroadcastChannel | null = null;
try {
  syncChannel = new BroadcastChannel('good-days-sync');
} catch {
  // BroadcastChannel not supported (e.g. older Safari) - tabs won't sync but won't break
}

type EntrySavedCallback = (date: string) => void;
const entrySavedListeners: EntrySavedCallback[] = [];

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    const { type, date, tabId } = event.data || {};
    if (type === 'entry-saved' && tabId !== TAB_ID && typeof date === 'string') {
      for (const listener of entrySavedListeners) {
        listener(date);
      }
    }
  };
}

function broadcastSave(date: string): void {
  try {
    syncChannel?.postMessage({ type: 'entry-saved', date, tabId: TAB_ID });
  } catch {
    // Channel closed or not available - ignore
  }
}

// Debounce pending saves (300ms - batches rapid keystrokes, feels near-instant)
const SAVE_DEBOUNCE_MS = 300;
const pendingSaves = new Map<string, { entry: JournalEntry; timer: ReturnType<typeof setTimeout> }>();

// Logging utility for debugging storage issues
const log = (msg: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[gdays ${timestamp}] ${msg}`, data);
  } else {
    console.log(`[gdays ${timestamp}] ${msg}`);
  }
};

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

// Get all entries from IndexedDB (decrypts after read)
async function getEntriesFromIndexedDB(db: IDBDatabase): Promise<JournalEntry[]> {
  const rawRecords = await new Promise<unknown[]>((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  // Decrypt all entries in parallel
  if (currentKey) {
    const decrypted = await Promise.all(rawRecords.map(r => decryptEntry(r)));
    const entries = decrypted.filter((e): e is JournalEntry => e !== null);
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return entries;
  }

  // No key yet — filter for valid plaintext entries only
  const entries = rawRecords.filter(isValidEntry) as JournalEntry[];
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

// Write all entries to IndexedDB (upsert, no clear - safe for multi-tab)
// Encrypts before write
async function writeEntriesToIndexedDB(db: IDBDatabase, entries: JournalEntry[]): Promise<void> {
  if (entries.length === 0) return;

  // Encrypt if key available
  let records: (JournalEntry | EncryptedRecord)[];
  if (currentKey) {
    records = await Promise.all(entries.map(e => encryptEntry(e)));
  } else {
    records = entries;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
    const store = transaction.objectStore(ENTRIES_STORE);

    let completed = 0;
    const total = records.length;

    for (const record of records) {
      const request = store.put(record);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };
    }
  });
}

// Write a single entry to IndexedDB (encrypts before write)
async function writeSingleEntryToIndexedDB(db: IDBDatabase, entry: JournalEntry): Promise<void> {
  let record: JournalEntry | EncryptedRecord;
  if (currentKey) {
    record = await encryptEntry(entry);
  } else {
    record = entry;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Delete a single entry from IndexedDB
async function deleteSingleEntryFromIndexedDB(db: IDBDatabase, date: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.delete(date);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
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
 * Initialize journal storage
 * - Opens IndexedDB
 * - Migrates from localStorage if needed
 * - Decrypts entries transparently
 * - Returns all entries
 *
 * Falls back to localStorage if IndexedDB fails
 */
export async function initJournalStorage(): Promise<JournalEntry[]> {
  log('initJournalStorage: starting');
  logAction('storage.init');

  // Request persistent storage so Chrome/Firefox/Android won't evict data under storage pressure
  // (Safari ignores this - its 7-day inactivity policy is not overridable)
  if (navigator.storage?.persist) {
    navigator.storage.persist().then(granted => {
      log('initJournalStorage: persistent storage ' + (granted ? 'granted' : 'denied'));
      logAction('storage.persist', { granted });
    }).catch(() => {});
  }

  try {
    const db = await openDatabase();
    log('initJournalStorage: database opened');

    // Check if we need to migrate from localStorage
    const localStorageEntries = parseLocalStorageEntries();
    const alreadyMigrated = await hasMigrated(db);
    log('initJournalStorage: state', { localStorageCount: localStorageEntries.length, alreadyMigrated });

    if (localStorageEntries.length > 0 && !alreadyMigrated) {
      // Migration needed: localStorage has entries and we haven't migrated
      log(`initJournalStorage: migrating ${localStorageEntries.length} entries from localStorage`);
      logAction('storage.init.migrate', { entryCount: localStorageEntries.length });

      // Write to IndexedDB (will encrypt if key is set)
      await writeEntriesToIndexedDB(db, localStorageEntries);

      // Verify the write
      const verifiedEntries = await getEntriesFromIndexedDB(db);
      if (verifiedEntries.length !== localStorageEntries.length) {
        throw new Error(`Migration verification failed: expected ${localStorageEntries.length}, got ${verifiedEntries.length}`);
      }

      // Mark as migrated and delete from localStorage
      await markMigrated(db);
      localStorage.removeItem('journalEntries');

      // Set encryption mode if key is available
      if (currentKey) {
        await setEncryptionMode(db, keyMode);
      }

      log('initJournalStorage: migration complete', { entryCount: verifiedEntries.length });
      logAction('storage.init.done', { entryCount: verifiedEntries.length, fallback: false });

      db.close();
      return verifiedEntries;
    }

    // Load from IndexedDB (decrypts transparently)
    const indexedDBEntries = await getEntriesFromIndexedDB(db);
    log('initJournalStorage: loaded from IndexedDB', { entryCount: indexedDBEntries.length, dates: indexedDBEntries.map(e => e.date) });

    // Clean up any stale localStorage backup from older versions
    if (localStorageEntries.length > 0 && alreadyMigrated) {
      localStorage.removeItem('journalEntries');
      log('initJournalStorage: cleared stale localStorage backup');
    }

    // Dead man's switch: if password protection flag is set but no password hash
    // exists in localStorage, someone cleared cookies/site data. Wipe entries.
    const passwordProtected = await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get('passwordProtected');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value === true);
    });

    if (passwordProtected && localStorage.getItem('passwordHash') === null) {
      log('initJournalStorage: password protection flag set but no password hash — clearing entries (cookie wipe detected)');
      logAction('storage.init.cookieWipeDetected');
      // Clear all entries
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(ENTRIES_STORE, 'readwrite');
        const store = transaction.objectStore(ENTRIES_STORE);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      // Clear the flag too (clean slate)
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE, 'readwrite');
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      db.close();
      return [];
    }

    // Encryption migration: if entries are plaintext but we have a key, encrypt them
    const storedMode = await getEncryptionMode();
    if (currentKey && (storedMode === 'none') && indexedDBEntries.length > 0) {
      log('initJournalStorage: migrating plaintext entries to encrypted');
      logAction('storage.init.encryptMigrate', { count: indexedDBEntries.length });
      await writeEntriesToIndexedDB(db, indexedDBEntries);
      await setEncryptionMode(db, keyMode);
    }

    logAction('storage.init.done', { entryCount: indexedDBEntries.length, fallback: false });
    db.close();
    return indexedDBEntries;
  } catch (error) {
    log('initJournalStorage: IndexedDB failed, using localStorage fallback', error);
    logAction('storage.init.fallback');
    fallbackMode = true;
    const fallbackEntries = parseLocalStorageEntries();
    logAction('storage.init.done', { entryCount: fallbackEntries.length, fallback: true });
    return fallbackEntries;
  }
}

/**
 * Save all journal entries to IndexedDB (upsert, no clear)
 * Fire-and-forget async - doesn't block the caller
 * Falls back to localStorage if IndexedDB failed
 */
export function saveAllJournalEntries(entries: JournalEntry[]): void {
  log('saveAllJournalEntries: saving', { entryCount: entries.length, dates: entries.map(e => e.date) });
  logAction('storage.saveAll', { entryCount: entries.length });
  if (fallbackMode) {
    // Fallback: use localStorage (skip encryption)
    localStorage.setItem('journalEntries', JSON.stringify(entries));
    log('saveAllJournalEntries: saved to localStorage (fallback)');
    return;
  }

  // Fire-and-forget IndexedDB write
  (async () => {
    try {
      const db = await openDatabase();
      await writeEntriesToIndexedDB(db, entries);
      db.close();
      log('saveAllJournalEntries: saved to IndexedDB', { entryCount: entries.length });
    } catch (error) {
      log('saveAllJournalEntries: FAILED, falling back to localStorage', error);
      fallbackMode = true;
      localStorage.setItem('journalEntries', JSON.stringify(entries));
    }
  })();
}

/**
 * Save a single journal entry to IndexedDB (debounced 300ms)
 * Batches rapid keystrokes into one write. Safe for multi-tab.
 */
export function saveSingleEntry(entry: JournalEntry): void {
  log('saveSingleEntry: queued', { date: entry.date, contentLength: entry.content.length });
  if (fallbackMode) {
    const entries = parseLocalStorageEntries();
    const index = entries.findIndex(e => e.date === entry.date);
    if (index >= 0) {
      entries[index] = entry;
    } else {
      entries.push(entry);
    }
    localStorage.setItem('journalEntries', JSON.stringify(entries));
    log('saveSingleEntry: saved to localStorage (fallback)');
    logAction('storage.save.fallback', { date: entry.date });
    return;
  }

  // Clear previous timer for this date
  const pending = pendingSaves.get(entry.date);
  if (pending) {
    clearTimeout(pending.timer);
  }

  const timer = setTimeout(() => {
    pendingSaves.delete(entry.date);
    writeEntryToStorage(entry);
  }, SAVE_DEBOUNCE_MS);

  pendingSaves.set(entry.date, { entry, timer });
}

/** Cancel all pending debounced saves without writing (called during reset) */
export function cancelPendingSaves(): void {
  for (const [, { timer }] of pendingSaves) {
    clearTimeout(timer);
  }
  pendingSaves.clear();
}

/** Flush all debounced saves immediately (called on beforeunload) */
export function flushPendingSaves(): void {
  const count = pendingSaves.size;
  if (count > 0) logAction('storage.flush', { count });
  for (const [, { entry, timer }] of pendingSaves) {
    clearTimeout(timer);
    writeEntryToStorage(entry);
  }
  pendingSaves.clear();
}

function writeEntryToStorage(entry: JournalEntry): void {
  (async () => {
    try {
      const db = await openDatabase();
      await writeSingleEntryToIndexedDB(db, entry);
      db.close();
      log('saveSingleEntry: saved to IndexedDB', { date: entry.date });
      logAction('storage.save', { date: entry.date });
      broadcastSave(entry.date);
    } catch (error) {
      log('saveSingleEntry: FAILED, switching to fallback mode', { date: entry.date, error });
      logAction('storage.save.fail', { date: entry.date });
      fallbackMode = true;
      const entries = parseLocalStorageEntries();
      const index = entries.findIndex(e => e.date === entry.date);
      if (index >= 0) {
        entries[index] = entry;
      } else {
        entries.push(entry);
      }
      localStorage.setItem('journalEntries', JSON.stringify(entries));
    }
  })();
}

/**
 * Delete a single journal entry from IndexedDB
 * Fire-and-forget async - only touches this one entry, safe for multi-tab
 */
export function deleteSingleEntry(date: string): void {
  log('deleteSingleEntry: deleting', { date });

  // Cancel any pending debounced save for this date to prevent zombie resurrection
  const pending = pendingSaves.get(date);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSaves.delete(date);
    log('deleteSingleEntry: cancelled pending save', { date });
  }

  if (fallbackMode) {
    // Fallback: read all, remove one, write all back
    const entries = parseLocalStorageEntries().filter(e => e.date !== date);
    localStorage.setItem('journalEntries', JSON.stringify(entries));
    log('deleteSingleEntry: deleted from localStorage (fallback)');
    return;
  }

  (async () => {
    try {
      const db = await openDatabase();
      await deleteSingleEntryFromIndexedDB(db, date);
      db.close();
      log('deleteSingleEntry: deleted from IndexedDB', { date });
      logAction('storage.delete', { date });
    } catch (error) {
      log('deleteSingleEntry: FAILED, switching to fallback mode', { date, error });
      fallbackMode = true;
      // Fallback: read all, remove one, write all back
      const entries = parseLocalStorageEntries().filter(e => e.date !== date);
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
 * Subscribe to entry saves from OTHER tabs.
 * Callback receives the date string that was saved.
 * Returns an unsubscribe function.
 */
export function onEntrySaved(callback: EntrySavedCallback): () => void {
  entrySavedListeners.push(callback);
  return () => {
    const index = entrySavedListeners.indexOf(callback);
    if (index >= 0) entrySavedListeners.splice(index, 1);
  };
}

/**
 * Load a single entry from IndexedDB by date (decrypts after read).
 * Returns null if not found or if in fallback mode.
 */
export async function loadSingleEntry(date: string): Promise<JournalEntry | null> {
  if (fallbackMode) {
    return parseLocalStorageEntries().find(e => e.date === date) || null;
  }
  try {
    const db = await openDatabase();
    const rawRecord = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(ENTRIES_STORE, 'readonly');
      const store = transaction.objectStore(ENTRIES_STORE);
      const request = store.get(date);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
    db.close();
    if (!rawRecord) return null;
    return await decryptEntry(rawRecord);
  } catch {
    return null;
  }
}

/**
 * Set the passwordProtected flag in IndexedDB metadata.
 * Used as a "dead man's switch" — if this flag is true but no passwordHash
 * exists in localStorage, entries self-destruct (someone cleared cookies).
 */
export async function setPasswordProtectedFlag(value: boolean): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.put({ key: 'passwordProtected', value });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    db.close();
  } catch (error) {
    log('setPasswordProtectedFlag: failed', error);
  }
}

/**
 * Get the passwordProtected flag from IndexedDB metadata.
 */
export async function getPasswordProtectedFlag(): Promise<boolean> {
  try {
    const db = await openDatabase();
    const result = await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get('passwordProtected');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value === true);
    });
    db.close();
    return result;
  } catch {
    return false;
  }
}

/**
 * Clear all journal data from IndexedDB (for reset functionality)
 */
export async function clearJournalStorage(): Promise<void> {
  logAction('storage.clear');
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

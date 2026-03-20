// IndexedDB storage for journal entries
// Provides effectively unlimited storage compared to localStorage's 5MB limit
// Entries are encrypted at rest (AES-GCM) — app-secret key or password-derived key

import type { JournalEntry } from '@features/journal/types';
import { logAction } from '@shared/logger';
import { encryptWithKey, decryptWithKey, generateDEK, wrapDEK } from '@shared/crypto';

const DB_NAME = 'good-days';
const DB_VERSION = 1;
const ENTRIES_STORE = 'entries';
const METADATA_STORE = 'metadata';

// Track if we're in fallback mode (IndexedDB failed, using localStorage)
let fallbackMode = false;

// Track dates that failed decryption (prevents "ensure today" from overwriting encrypted data)
const decryptionFailures = new Set<string>();

// Detect Electron environment (window.electronAPI exposed by preload script)
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI?.platform === 'electron';
}

// --- Encryption state ---

type EncryptionKeyMode = 'app' | 'password' | 'dek';

let currentKey: CryptoKey | null = null;
let keyMode: EncryptionKeyMode = 'app';

// Set the active encryption key (called by auth layer)
export function setEncryptionKey(key: CryptoKey, mode: EncryptionKeyMode): void {
  currentKey = key;
  keyMode = mode;
}

// Get the encryption mode from IndexedDB metadata (or localStorage in Electron)
export async function getEncryptionMode(): Promise<EncryptionKeyMode | 'none'> {
  if (isElectron()) {
    const mode = localStorage.getItem('electronEncryptionMode');
    return (mode as EncryptionKeyMode) || 'none';
  }
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
    return (result as EncryptionKeyMode) || 'none';
  } catch {
    return 'none';
  }
}

// Set the encryption mode in IndexedDB metadata (or localStorage in Electron)
async function setEncryptionMode(db: IDBDatabase | null, mode: EncryptionKeyMode): Promise<void> {
  if (isElectron() || db === null) {
    localStorage.setItem('electronEncryptionMode', mode);
    return;
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.put({ key: 'encryptionMode', value: mode });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// --- DEK/KEK wrapped key storage ---

export interface WrappedDEKData {
  wrapped: string;       // base64 of IV + encrypted raw DEK
  protection: 'app' | 'password'; // what KEK was used to wrap
}

// Read the wrapped DEK from IndexedDB metadata
export async function getWrappedDEK(): Promise<WrappedDEKData | null> {
  if (isElectron()) {
    const data = localStorage.getItem('electronWrappedDEK');
    return data ? JSON.parse(data) : null;
  }
  try {
    const db = await openDatabase();
    const result = await new Promise<WrappedDEKData | null>((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get('wrappedDEK');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const data = request.result?.value;
        resolve(data ? data as WrappedDEKData : null);
      };
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

// Store the wrapped DEK in IndexedDB metadata
async function setWrappedDEKInDB(db: IDBDatabase | null, wrapped: string, protection: 'app' | 'password'): Promise<void> {
  const data: WrappedDEKData = { wrapped, protection };
  if (isElectron() || db === null) {
    localStorage.setItem('electronWrappedDEK', JSON.stringify(data));
    return;
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.put({ key: 'wrappedDEK', value: data });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Re-wrap the in-memory DEK with a new KEK.
 * Used for password set/change/remove — O(1), no entry re-encryption.
 */
export async function rewrapDEK(newKEK: CryptoKey, newProtection: 'app' | 'password'): Promise<void> {
  if (!currentKey) throw new Error('No DEK in memory');
  const wrapped = await wrapDEK(currentKey, newKEK);

  if (isElectron()) {
    await setWrappedDEKInDB(null, wrapped, newProtection);
  } else {
    const db = await openDatabase();
    await setWrappedDEKInDB(db, wrapped, newProtection);
    db.close();
  }

  log('rewrapDEK: done', { protection: newProtection });
  logAction('storage.rewrapDEK', { protection: newProtection });
}

/**
 * One-time migration from direct key encryption to DEK/KEK architecture.
 * Generates a random DEK, re-encrypts all entries with it, wraps DEK with the provided KEK.
 * Atomic: if anything fails, entries stay encrypted with the old key.
 * Returns the DEK for the caller to cache.
 */
export async function migrateToDEK(kek: CryptoKey, kekProtection: 'app' | 'password'): Promise<CryptoKey> {
  log('migrateToDEK: starting', { protection: kekProtection });
  logAction('storage.migrateToDEK.start', { protection: kekProtection });

  // Generate random DEK
  const dek = await generateDEK();

  // Re-encrypt all entries: old key → DEK
  // reEncryptAllEntries handles atomicity (rollback on failure)
  await reEncryptAllEntries(dek, 'dek');
  // After this, currentKey = dek, keyMode = 'dek'

  // Wrap DEK with KEK and store
  const wrapped = await wrapDEK(dek, kek);

  if (isElectron()) {
    await setWrappedDEKInDB(null, wrapped, kekProtection);
  } else {
    const db = await openDatabase();
    await setWrappedDEKInDB(db, wrapped, kekProtection);
    db.close();
  }

  log('migrateToDEK: complete');
  logAction('storage.migrateToDEK.done');
  return dek;
}

/**
 * Get raw encrypted entry records from IndexedDB (for v3 backup export).
 * Returns entries as-is (still encrypted with DEK), without decrypting.
 */
export async function getRawEncryptedEntries(): Promise<EncryptedRecord[]> {
  if (isElectron()) {
    const api = window.electronAPI!;
    const rawPairs = await api.storage.loadAllEntries();
    return rawPairs.map(({ data }) => JSON.parse(data) as EncryptedRecord);
  }

  const db = await openDatabase();
  const records = await new Promise<EncryptedRecord[]>((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  db.close();
  return records;
}

// --- Encrypt/decrypt entry helpers ---

// Encrypted record shape in IndexedDB
export interface EncryptedRecord {
  date: string;
  _enc: EncryptionKeyMode;
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
    log('decryptEntry: FAILED TO DECRYPT — entry will be invisible but preserved in IndexedDB', { date: r.date });
    decryptionFailures.add(r.date as string);
    return null;
  }
}

// Re-encrypt all entries with a new key (called during password transitions and DEK migration)
export async function reEncryptAllEntries(newKey: CryptoKey, newMode: EncryptionKeyMode): Promise<void> {
  if (fallbackMode) return; // Skip encryption in fallback mode

  // --- Electron path: load via IPC, re-encrypt, save via IPC ---
  if (isElectron()) {
    const api = window.electronAPI!;
    const rawPairs = await api.storage.loadAllEntries();

    // Parse and decrypt all with current key
    const entries = (await Promise.all(
      rawPairs.map(({ data }) => decryptEntry(JSON.parse(data)))
    )).filter((e): e is JournalEntry => e !== null);

    // Switch to new key
    const oldKey = currentKey;
    const oldMode = keyMode;
    currentKey = newKey;
    keyMode = newMode;

    try {
      // Re-encrypt all with new key and save via IPC
      for (const entry of entries) {
        const record = await encryptEntry(entry);
        await api.storage.saveEntry(entry.date, JSON.stringify(record));
      }

      // Update metadata
      await setEncryptionMode(null, newMode);
      log('reEncryptAllEntries: done (electron)', { count: entries.length, mode: newMode });
      logAction('storage.reencrypt', { count: entries.length, mode: newMode });
    } catch (error) {
      // Rollback key on failure
      currentKey = oldKey;
      keyMode = oldMode;
      throw error;
    }
    return;
  }

  // --- Web path: IndexedDB ---
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

// Throttle pending saves (300ms - saves every 300ms during active typing, max 300ms data loss)
const SAVE_THROTTLE_MS = 300;
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
async function getEntriesFromIndexedDB(db: IDBDatabase, onProgress?: (entries: JournalEntry[]) => void): Promise<JournalEntry[]> {
  const rawRecords = await new Promise<unknown[]>((resolve, reject) => {
    const transaction = db.transaction(ENTRIES_STORE, 'readonly');
    const store = transaction.objectStore(ENTRIES_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  if (currentKey) {
    if (onProgress) {
      // Decrypt one at a time, yielding each entry progressively
      const entries: JournalEntry[] = [];
      for (const record of rawRecords) {
        const entry = await decryptEntry(record);
        if (entry) {
          entries.push(entry);
          entries.sort((a, b) => b.date.localeCompare(a.date));
          onProgress([...entries]);
        }
      }
      return entries;
    }
    // No progress callback — decrypt all in parallel (fast path)
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
/**
 * Check if a date had a decryption failure during the last load.
 * Used to prevent "ensure today" from overwriting encrypted data with empty content.
 */
export function hasDecryptionFailure(date: string): boolean {
  return decryptionFailures.has(date);
}

/**
 * Get all dates that had decryption failures during the last load.
 */
export function getDecryptionFailures(): string[] {
  return Array.from(decryptionFailures);
}

export async function initJournalStorage(onProgress?: (entries: JournalEntry[]) => void): Promise<JournalEntry[]> {
  log('initJournalStorage: starting');
  logAction('storage.init');

  // Clear previous decryption failures on fresh load
  decryptionFailures.clear();

  // --- Electron path: load all entries via IPC, skip IndexedDB entirely ---
  if (isElectron()) {
    const api = window.electronAPI!;

    // Dead man's switch: if password protection flag is set but no password hash
    // exists in localStorage, someone cleared cookies/site data. Wipe entries.
    const passwordProtected = localStorage.getItem('electronPasswordProtected') === 'true';
    if (passwordProtected && localStorage.getItem('passwordHash') === null) {
      log('initJournalStorage: password protection flag set but no password hash — clearing entries (electron, cookie wipe detected)');
      logAction('storage.init.cookieWipeDetected');
      const allPairs = await api.storage.loadAllEntries();
      for (const { date } of allPairs) {
        await api.storage.deleteEntry(date);
      }
      localStorage.removeItem('electronPasswordProtected');
      localStorage.removeItem('electronEncryptionMode');
      return [];
    }

    const rawPairs = await api.storage.loadAllEntries();
    log('initJournalStorage: loaded from electron IPC', { entryCount: rawPairs.length });

    // Parse and decrypt all entries
    const entries: JournalEntry[] = [];
    for (const { data } of rawPairs) {
      const record = JSON.parse(data);
      const entry = await decryptEntry(record);
      if (entry) entries.push(entry);
    }

    entries.sort((a, b) => b.date.localeCompare(a.date));

    // Surface decryption failures
    if (decryptionFailures.size > 0) {
      const failedDates = Array.from(decryptionFailures);
      log('initJournalStorage: WARNING — decryption failed for entries (electron)', { dates: failedDates, count: failedDates.length });
      logAction('storage.decryptionFailure', { dates: failedDates, count: failedDates.length });
      console.warn(`[gdays] ${failedDates.length} entries failed to decrypt and are hidden. Data is preserved in userData/entries/.`);
    }

    logAction('storage.init.done', { entryCount: entries.length, fallback: false });
    return entries;
  }

  // --- Web path: IndexedDB ---

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
    const indexedDBEntries = await getEntriesFromIndexedDB(db, onProgress);
    log('initJournalStorage: loaded from IndexedDB', { entryCount: indexedDBEntries.length, dates: indexedDBEntries.map(e => e.date) });

    // Surface decryption failures prominently
    if (decryptionFailures.size > 0) {
      const failedDates = Array.from(decryptionFailures);
      log('initJournalStorage: WARNING — decryption failed for entries', { dates: failedDates, count: failedDates.length });
      logAction('storage.decryptionFailure', { dates: failedDates, count: failedDates.length });
      console.warn(`[gdays] ${failedDates.length} entries failed to decrypt and are hidden: ${failedDates.join(', ')}. Data is preserved in IndexedDB.`);
    }

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

  // --- Electron path: encrypt and save each entry via IPC ---
  if (isElectron()) {
    const api = window.electronAPI!;
    (async () => {
      try {
        for (const entry of entries) {
          const record = await encryptEntry(entry);
          await api.storage.saveEntry(entry.date, JSON.stringify(record));
        }
        log('saveAllJournalEntries: saved via electron IPC', { entryCount: entries.length });
      } catch (error) {
        log('saveAllJournalEntries: FAILED (electron)', error);
      }
    })();
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
 * Save a single journal entry to IndexedDB (throttled 300ms)
 * Saves every 300ms during active typing. Safe for multi-tab.
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

  const pending = pendingSaves.get(entry.date);
  if (pending) {
    // Timer already running — just update to latest entry
    pending.entry = entry;
  } else {
    // No pending save — start a new throttle cycle
    const date = entry.date;
    const state: { entry: JournalEntry; timer: ReturnType<typeof setTimeout> } = {
      entry,
      timer: setTimeout(() => {
        pendingSaves.delete(date);
        writeEntryToStorage(state.entry);
      }, SAVE_THROTTLE_MS),
    };
    pendingSaves.set(date, state);
  }
}

/** Cancel a pending throttled save for a specific date without writing (called on external sync) */
export function cancelPendingSave(date: string): void {
  const pending = pendingSaves.get(date);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSaves.delete(date);
  }
}

/** Cancel all pending throttled saves without writing (called during reset) */
export function cancelPendingSaves(): void {
  for (const [, { timer }] of pendingSaves) {
    clearTimeout(timer);
  }
  pendingSaves.clear();
}

/** Flush all pending throttled saves immediately (called on beforeunload) */
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
  // --- Electron path: encrypt and save via IPC ---
  if (isElectron()) {
    const api = window.electronAPI!;
    (async () => {
      try {
        const record = await encryptEntry(entry);
        await api.storage.saveEntry(entry.date, JSON.stringify(record));
        log('saveSingleEntry: saved via electron IPC', { date: entry.date });
        logAction('storage.save', { date: entry.date });
      } catch (error) {
        log('saveSingleEntry: FAILED (electron)', { date: entry.date, error });
        logAction('storage.save.fail', { date: entry.date });
      }
    })();
    return;
  }

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

  // Cancel any pending throttled save for this date to prevent zombie resurrection
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

  // --- Electron path: delete via IPC ---
  if (isElectron()) {
    const api = window.electronAPI!;
    (async () => {
      try {
        await api.storage.deleteEntry(date);
        log('deleteSingleEntry: deleted via electron IPC', { date });
        logAction('storage.delete', { date });
      } catch (error) {
        log('deleteSingleEntry: FAILED (electron)', { date, error });
      }
    })();
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
  // --- Electron path: load via IPC ---
  if (isElectron()) {
    try {
      const data = await window.electronAPI!.storage.loadEntry(date);
      if (!data) return null;
      return await decryptEntry(JSON.parse(data));
    } catch {
      return null;
    }
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
  if (isElectron()) {
    if (value) {
      localStorage.setItem('electronPasswordProtected', 'true');
    } else {
      localStorage.removeItem('electronPasswordProtected');
    }
    return;
  }
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
  if (isElectron()) {
    return localStorage.getItem('electronPasswordProtected') === 'true';
  }
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

  // --- Electron path: delete all entry files via IPC ---
  if (isElectron()) {
    try {
      const api = window.electronAPI!;
      const allPairs = await api.storage.loadAllEntries();
      for (const { date } of allPairs) {
        await api.storage.deleteEntry(date);
      }
      localStorage.removeItem('electronEncryptionMode');
      localStorage.removeItem('electronPasswordProtected');
      log('clearJournalStorage: cleared via electron IPC', { count: allPairs.length });
    } catch (error) {
      console.error('Failed to clear electron storage:', error);
    }
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

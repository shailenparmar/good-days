// App-level encryption for backups and at-rest journal encryption
// Uses AES-GCM with derived keys from fixed passphrase or user password

const APP_SECRET = 'good-days-backup-v1-2026';

// Convert Uint8Array to base64 safely — chunked to avoid
// exceeding the JS engine's max argument limit for String.fromCharCode()
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Separate salt for at-rest encryption (distinct from backup salt)
const ENCRYPT_SALT = 'good-days-encrypt-salt';

// --- Key caching ---

let cachedBackupKey: CryptoKey | null = null;
let cachedAppEncryptKey: CryptoKey | null = null;

// Backup key (non-extractable, used for backup encrypt/decrypt)
async function getKey(): Promise<CryptoKey> {
  if (cachedBackupKey) return cachedBackupKey;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(APP_SECRET),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  cachedBackupKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('good-days-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return cachedBackupKey;
}

// App-secret key for at-rest encryption (extractable, for sessionStorage JWK export)
export async function getAppEncryptKey(): Promise<CryptoKey> {
  if (cachedAppEncryptKey) return cachedAppEncryptKey;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(APP_SECRET),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  cachedAppEncryptKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPT_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  return cachedAppEncryptKey;
}

// --- Low-level encrypt/decrypt with any CryptoKey ---

export async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

export async function decryptWithKey(ciphertext: string, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return decoder.decode(decrypted);
}

// --- Password key derivation ---

export async function derivePasswordKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPT_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable (for JWK export to sessionStorage)
    ['encrypt', 'decrypt']
  );
}

// --- JWK export/import (for sessionStorage persistence) ---

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

// --- DEK/KEK (Data Encryption Key / Key Encryption Key) ---

// Generate a random 256-bit DEK for encrypting journal entries
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable (needed for wrapping/export)
    ['encrypt', 'decrypt']
  );
}

// Wrap (encrypt) the DEK with a KEK — stores IV + ciphertext as base64
export async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const rawDEK = await crypto.subtle.exportKey('raw', dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    rawDEK
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return uint8ToBase64(combined);
}

// Unwrap (decrypt) the DEK with a KEK — returns usable CryptoKey
export async function unwrapDEK(wrappedDEK: string, kek: CryptoKey): Promise<CryptoKey> {
  const combined = Uint8Array.from(atob(wrappedDEK), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const rawDEK = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kek,
    data
  );
  return crypto.subtle.importKey(
    'raw',
    rawDEK,
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

// --- Backup encryption (unchanged API, now cached) ---

export async function encryptText(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await getKey();

  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

export async function decryptText(encryptedBase64: string): Promise<string> {
  const decoder = new TextDecoder();
  const key = await getKey();

  // Decode base64 and split IV from ciphertext
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return decoder.decode(decrypted);
}

// Just returns the encrypted content - no header needed (timestamp is in filename)
export function formatEncryptedBackup(encryptedContent: string): string {
  return encryptedContent;
}

// Check if a string looks like base64-encoded data
function looksLikeBase64(str: string): boolean {
  // Base64 chars: A-Z, a-z, 0-9, +, /, = (padding)
  // Must be reasonably long (our encrypted content is always substantial)
  return str.length > 50 && /^[A-Za-z0-9+/=]+$/.test(str);
}

export function parseEncryptedBackup(fileContent: string): string | null {
  const lines = fileContent.split('\n');

  // Find the first line that looks like base64 content
  // This handles: new format (date header), old format (good days encrypted backup), or no header
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (looksLikeBase64(line)) {
      // Found base64 content - return it and any continuation lines
      return lines.slice(i).join('\n').trim();
    }
  }

  return null;
}

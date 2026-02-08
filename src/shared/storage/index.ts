// Storage abstraction - uses localStorage with at-rest encryption
// Encryption: XOR cipher with static key (obfuscation, same as backup encryption)

const ENC_PREFIX = '$e:';
const ENC_KEY = 'gdays-ls-cipher-v1';

function encryptValue(plaintext: string): string {
  const keyBytes = new TextEncoder().encode(ENC_KEY);
  const textBytes = new TextEncoder().encode(plaintext);
  const result = new Uint8Array(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return ENC_PREFIX + btoa(String.fromCharCode(...result));
}

export function decryptValue(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // unencrypted (pre-encryption migration)
  const encoded = stored.slice(ENC_PREFIX.length);
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(ENC_KEY);
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(result);
}

// Get item from storage (auto-decrypts)
export const getItem = (key: string): string | null => {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  return decryptValue(raw);
};

// Set item in storage (always encrypts)
export const setItem = (key: string, value: string): void => {
  localStorage.setItem(key, encryptValue(value));
};

// Remove item from storage
export const removeItem = (key: string): void => {
  localStorage.removeItem(key);
};

// Initialize storage - no-op for localStorage
export const initStorage = async (): Promise<void> => {
  // localStorage doesn't need initialization
};

// Force save - no-op for localStorage (writes are synchronous)
export const forceSave = async (): Promise<void> => {
  // localStorage writes are synchronous, nothing to flush
};

// Check if storage is ready
export const isStorageReady = (): boolean => {
  return true;
};

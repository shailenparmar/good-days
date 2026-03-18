import { useState, useCallback, useEffect } from 'react';
import { getItem, setItem, removeItem } from '@shared/storage';
import { setPasswordProtectedFlag } from '@shared/storage/journalStorage';
import { setEncryptionKey, getEncryptionMode, reEncryptAllEntries } from '@shared/storage/journalStorage';
import { getAppEncryptKey, derivePasswordKey, exportKeyToJWK, importKeyFromJWK } from '@shared/crypto';
import { logAction } from '@shared/logger';

const PASSWORD_KEY = 'passwordHash';
const PASSWORD_SALT_KEY = 'passwordSalt';
const PASSWORD_VERSION_KEY = 'passwordVersion';
const CURRENT_PASSWORD_VERSION = 2;
const LOGIN_COUNT_KEY = 'totalLogins';

// Session unlock key - uses sessionStorage (not our custom storage)
// sessionStorage persists across refresh but clears on window/tab close
const SESSION_UNLOCKED_KEY = 'gooddays_session_unlocked';

// Encryption key JWK stored in sessionStorage (survives refresh, not tab close)
const ENCRYPTION_JWK_KEY = 'gooddays_encryption_jwk';

// Generate a random salt
function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2 key derivation for secure password hashing
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// One-time migration: clear old password format so user can set a new one
function migratePasswordIfNeeded(): void {
  const version = getItem(PASSWORD_VERSION_KEY);
  if (version === String(CURRENT_PASSWORD_VERSION)) {
    return;
  }

  // Old password exists but not in new format - clear it
  const oldHash = getItem(PASSWORD_KEY);
  if (oldHash) {
    removeItem(PASSWORD_KEY);
    removeItem(PASSWORD_SALT_KEY);
    logAction('auth.password.migrated');
  }

  setItem(PASSWORD_VERSION_KEY, String(CURRENT_PASSWORD_VERSION));
}

/**
 * Initialize encryption key on app start.
 * Returns { ready, needsPassword } to guide init flow.
 */
export async function initEncryptionKey(): Promise<{ ready: boolean; needsPassword: boolean }> {
  const hasPass = getItem(PASSWORD_KEY) !== null;
  const encMode = await getEncryptionMode();

  if (!hasPass) {
    // No password → use app-secret key
    const appKey = await getAppEncryptKey();
    setEncryptionKey(appKey, 'app');
    return { ready: true, needsPassword: false };
  }

  // Has password — check if session has a stored JWK
  const storedJwk = sessionStorage.getItem(ENCRYPTION_JWK_KEY);
  if (storedJwk) {
    try {
      const jwk = JSON.parse(storedJwk);
      const key = await importKeyFromJWK(jwk);
      setEncryptionKey(key, encMode === 'password' ? 'password' : 'app');
      return { ready: true, needsPassword: false };
    } catch {
      // JWK invalid — fall through to needsPassword
      sessionStorage.removeItem(ENCRYPTION_JWK_KEY);
    }
  }

  // No session key — need password to derive key
  return { ready: false, needsPassword: true };
}

export function useAuth() {
  // Run migration on module load
  useState(() => {
    migratePasswordIfNeeded();
    return null;
  });

  // Check if user has a password set (persisted in IndexedDB/localStorage)
  const [hasPassword, setHasPassword] = useState(() => getItem(PASSWORD_KEY) !== null);

  // Whether the encryption key is available for storage ops
  const [encryptionKeyReady, setEncryptionKeyReady] = useState(false);

  // Lock state logic:
  // - Locked = has password AND not unlocked this session
  // - sessionStorage persists across refresh (stays unlocked)
  // - sessionStorage clears on window/tab close (locks on reopen)
  // - ESC key clears session flag (locks immediately)
  const [isLocked, setIsLocked] = useState(() => {
    const hasPass = getItem(PASSWORD_KEY) !== null;
    const unlockedThisSession = sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
    return hasPass && !unlockedThisSession;
  });

  const [passwordInput, setPasswordInput] = useState('');

  // Initialize encryption key on mount
  useEffect(() => {
    initEncryptionKey().then(({ ready }) => {
      setEncryptionKeyReady(ready);
    });
  }, []);

  // Sync hasPassword with storage
  const refreshHasPassword = useCallback(() => {
    const exists = getItem(PASSWORD_KEY) !== null;
    setHasPassword(exists);
    // Also re-evaluate lock state
    const unlockedThisSession = sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
    setIsLocked(exists && !unlockedThisSession);
    return exists;
  }, []);

  // Check storage on mount and re-evaluate lock state
  useEffect(() => {
    refreshHasPassword();
  }, [refreshHasPassword]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent, password: string): Promise<boolean> => {
    e.preventDefault();
    const trimmed = password.trim();
    const storedHash = getItem(PASSWORD_KEY);
    const storedSalt = getItem(PASSWORD_SALT_KEY);

    if (!storedHash || !storedSalt) {
      // Password was removed (possibly in another tab) - unlock and refresh state
      setHasPassword(false);
      setIsLocked(false);
      setPasswordInput('');
      // Fall back to app key
      const appKey = await getAppEncryptKey();
      setEncryptionKey(appKey, 'app');
      setEncryptionKeyReady(true);
      return true; // Treat as successful unlock since there's no password
    }

    const inputHash = await hashPassword(trimmed, storedSalt);

    if (timingSafeEqual(inputHash, storedHash)) {
      // Password correct — unlock immediately, derive key in background
      setIsLocked(false);
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      setPasswordInput('');
      const currentLogins = Number(getItem(LOGIN_COUNT_KEY) || '0');
      setItem(LOGIN_COUNT_KEY, String(currentLogins + 1));
      logAction('auth.unlock');

      // Derive encryption key asynchronously — entries load when encryptionKeyReady flips
      (async () => {
        const encKey = await derivePasswordKey(trimmed);
        setEncryptionKey(encKey, 'password');
        const jwk = await exportKeyToJWK(encKey);
        sessionStorage.setItem(ENCRYPTION_JWK_KEY, JSON.stringify(jwk));
        setEncryptionKeyReady(true);
      })();

      return true;
    } else {
      setPasswordInput('');
      logAction('auth.unlock.fail');
      return false;
    }
  }, []);

  const setPassword = useCallback(async (newPassword: string): Promise<boolean> => {
    const trimmed = newPassword.trim();
    if (trimmed.length === 0) return false;

    // Derive new encryption key BEFORE setting password hash
    const encKey = await derivePasswordKey(trimmed);

    // Re-encrypt all entries with the new password key
    await reEncryptAllEntries(encKey, 'password');

    // Now set the password hash (AFTER re-encryption succeeds)
    const salt = generateSalt();
    const hash = await hashPassword(trimmed, salt);
    setItem(PASSWORD_SALT_KEY, salt);
    setItem(PASSWORD_KEY, hash);
    setHasPassword(true);
    await setPasswordProtectedFlag(true);

    // Store JWK in sessionStorage
    const jwk = await exportKeyToJWK(encKey);
    sessionStorage.setItem(ENCRYPTION_JWK_KEY, JSON.stringify(jwk));

    // Invalidate stale session unlock flag so new password requires entry
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    logAction('auth.password.set');
    return true;
  }, []);

  const removePassword = useCallback(async () => {
    // Derive app-secret key and re-encrypt with it BEFORE removing password hash
    const appKey = await getAppEncryptKey();
    await reEncryptAllEntries(appKey, 'app');

    // Now remove the password hash (AFTER re-encryption succeeds)
    removeItem(PASSWORD_KEY);
    removeItem(PASSWORD_SALT_KEY);
    setHasPassword(false);
    setIsLocked(false);
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    sessionStorage.removeItem(ENCRYPTION_JWK_KEY);
    await setPasswordProtectedFlag(false);
    logAction('auth.password.removed');
  }, []);

  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = getItem(PASSWORD_KEY);
    const storedSalt = getItem(PASSWORD_SALT_KEY);
    if (!storedHash || !storedSalt) return false;
    const inputHash = await hashPassword(password.trim(), storedSalt);
    return timingSafeEqual(inputHash, storedHash);
  }, []);

  const lock = useCallback(() => {
    if (getItem(PASSWORD_KEY) !== null) {
      setIsLocked(true);
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      sessionStorage.removeItem(ENCRYPTION_JWK_KEY);
      logAction('auth.lock');
    }
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
  }, []);

  // Change password: re-encrypt with new password key
  const changePassword = useCallback(async (newPassword: string): Promise<boolean> => {
    const trimmed = newPassword.trim();
    if (trimmed.length === 0) return false;

    // Derive new encryption key
    const newEncKey = await derivePasswordKey(trimmed);

    // Re-encrypt all entries with the new key (old key is still cached in journalStorage)
    await reEncryptAllEntries(newEncKey, 'password');

    // Now update the password hash (AFTER re-encryption succeeds)
    const salt = generateSalt();
    const hash = await hashPassword(trimmed, salt);
    setItem(PASSWORD_SALT_KEY, salt);
    setItem(PASSWORD_KEY, hash);
    await setPasswordProtectedFlag(true);

    // Update sessionStorage JWK
    const jwk = await exportKeyToJWK(newEncKey);
    sessionStorage.setItem(ENCRYPTION_JWK_KEY, JSON.stringify(jwk));

    logAction('auth.password.changed');
    return true;
  }, []);

  return {
    isLocked,
    passwordInput,
    hasPassword,
    encryptionKeyReady,
    setPasswordInput,
    handlePasswordSubmit,
    setPassword,
    removePassword,
    changePassword,
    verifyPassword,
    lock,
    unlock,
    refreshHasPassword,
  };
}

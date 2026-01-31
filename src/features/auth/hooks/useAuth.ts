import { useState, useCallback, useEffect } from 'react';
import { getItem, setItem, removeItem } from '@shared/storage';

const PASSWORD_KEY = 'passwordHash';
const PASSWORD_SALT_KEY = 'passwordSalt';
const PASSWORD_VERSION_KEY = 'passwordVersion';
const CURRENT_PASSWORD_VERSION = 2;
const LOGIN_COUNT_KEY = 'totalLogins';

// Session unlock key - uses sessionStorage (not our custom storage)
// sessionStorage persists across refresh but clears on window/tab close
const SESSION_UNLOCKED_KEY = 'gooddays_session_unlocked';

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
  }

  setItem(PASSWORD_VERSION_KEY, String(CURRENT_PASSWORD_VERSION));
}

export function useAuth() {
  // Run migration on module load
  useState(() => {
    migratePasswordIfNeeded();
    return null;
  });

  // Check if user has a password set (persisted in IndexedDB/localStorage)
  const [hasPassword, setHasPassword] = useState(() => getItem(PASSWORD_KEY) !== null);

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

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    const storedHash = getItem(PASSWORD_KEY);
    const storedSalt = getItem(PASSWORD_SALT_KEY);

    if (!storedHash || !storedSalt) {
      setPasswordInput('');
      return false;
    }

    const inputHash = await hashPassword(passwordInput.trim(), storedSalt);

    if (timingSafeEqual(inputHash, storedHash)) {
      setIsLocked(false);
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      setPasswordInput('');
      // Increment login count
      const currentLogins = Number(getItem(LOGIN_COUNT_KEY) || '0');
      setItem(LOGIN_COUNT_KEY, String(currentLogins + 1));
      return true;
    } else {
      setPasswordInput('');
      return false;
    }
  }, [passwordInput]);

  const setPassword = useCallback(async (newPassword: string): Promise<boolean> => {
    const trimmed = newPassword.trim();
    if (trimmed.length === 0) return false;

    const salt = generateSalt();
    const hash = await hashPassword(trimmed, salt);
    setItem(PASSWORD_SALT_KEY, salt);
    setItem(PASSWORD_KEY, hash);
    setHasPassword(true);
    return true;
  }, []);

  const removePassword = useCallback(() => {
    removeItem(PASSWORD_KEY);
    removeItem(PASSWORD_SALT_KEY);
    setHasPassword(false);
    setIsLocked(false);
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
    }
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
  }, []);

  return {
    isLocked,
    passwordInput,
    hasPassword,
    setPasswordInput,
    handlePasswordSubmit,
    setPassword,
    removePassword,
    verifyPassword,
    lock,
    unlock,
    refreshHasPassword,
  };
}

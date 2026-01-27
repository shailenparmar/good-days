import { useState, useCallback, useEffect } from 'react';
import { getItem, setItem, removeItem } from '@shared/storage';

// Simple hash function for password storage
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'good-days-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const PASSWORD_KEY = 'passwordHash';
const UNLOCKED_KEY = 'sessionUnlocked'; // sessionStorage key - persists across refresh, clears on browser close

export function useAuth() {
  // Reactive state - syncs with storage
  const [hasPassword, setHasPassword] = useState(() => getItem(PASSWORD_KEY) !== null);
  // Only locked if has password AND not unlocked in this session
  const [isLocked, setIsLocked] = useState(() => {
    const hasPass = getItem(PASSWORD_KEY) !== null;
    const wasUnlocked = sessionStorage.getItem(UNLOCKED_KEY) === 'true';
    return hasPass && !wasUnlocked;
  });
  const [passwordInput, setPasswordInput] = useState('');

  // Sync hasPassword with storage
  const refreshHasPassword = useCallback(() => {
    const exists = getItem(PASSWORD_KEY) !== null;
    setHasPassword(exists);
    return exists;
  }, []);

  // Check storage on mount
  useEffect(() => {
    refreshHasPassword();
  }, [refreshHasPassword]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    const storedHash = getItem(PASSWORD_KEY);

    if (!storedHash) {
      setPasswordInput('');
      return false;
    }

    const inputHash = await hashPassword(passwordInput.trim());

    if (inputHash === storedHash) {
      setIsLocked(false);
      sessionStorage.setItem(UNLOCKED_KEY, 'true');
      setPasswordInput('');
      return true;
    } else {
      setPasswordInput('');
      return false;
    }
  }, [passwordInput]);

  const setPassword = useCallback(async (newPassword: string): Promise<boolean> => {
    const trimmed = newPassword.trim();
    if (trimmed.length === 0) return false;

    const hash = await hashPassword(trimmed);
    setItem(PASSWORD_KEY, hash);
    setHasPassword(true);
    return true;
  }, []);

  const removePassword = useCallback(() => {
    removeItem(PASSWORD_KEY);
    setHasPassword(false);
    setIsLocked(false);
  }, []);

  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = getItem(PASSWORD_KEY);
    if (!storedHash) return false;
    const inputHash = await hashPassword(password.trim());
    return inputHash === storedHash;
  }, []);

  const lock = useCallback(() => {
    if (getItem(PASSWORD_KEY) !== null) {
      setIsLocked(true);
      sessionStorage.removeItem(UNLOCKED_KEY);
    }
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    sessionStorage.setItem(UNLOCKED_KEY, 'true');
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

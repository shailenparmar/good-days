import { useState, useCallback } from 'react';
import { getItem, setItem } from '@shared/storage';

export function useAuth() {
  const [isLocked, setIsLocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [hasPassword, setHasPassword] = useState(() => {
    return getItem('userPassword') !== null;
  });

  const handlePasswordSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = getItem('userPassword');

    if (storedPassword && passwordInput.trim() === storedPassword) {
      setIsLocked(false);
      setPasswordInput('');
      return true;
    } else {
      setPasswordInput('');
      return false;
    }
  }, [passwordInput]);

  const setPassword = useCallback((newPassword: string) => {
    setItem('userPassword', newPassword);
    setHasPassword(true);
  }, []);

  // Read directly from storage each time - no stale closures
  const verifyPassword = (password: string): boolean => {
    const storedPassword = getItem('userPassword');
    if (!storedPassword) return false;
    return storedPassword.trim() === password.trim();
  };

  const lock = useCallback(() => {
    if (getItem('userPassword') !== null) {
      setIsLocked(true);
    }
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  return {
    isLocked,
    passwordInput,
    hasPassword,
    setPasswordInput,
    handlePasswordSubmit,
    setPassword,
    verifyPassword,
    lock,
    unlock,
  };
}

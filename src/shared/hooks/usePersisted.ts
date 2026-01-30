import { useState, useCallback, useRef } from 'react';
import { getItem, setItem } from '@shared/storage';

/**
 * A hook that persists state to localStorage.
 * Saves SYNCHRONOUSLY before React state updates to prevent race conditions.
 */
export function usePersisted<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = getItem(key);
    if (stored === null) return defaultValue;

    if (typeof defaultValue === 'boolean') {
      return (stored === 'true') as T;
    }
    if (typeof defaultValue === 'number') {
      const num = parseFloat(stored);
      return (isNaN(num) ? defaultValue : num) as T;
    }
    if (typeof defaultValue === 'object') {
      try {
        return JSON.parse(stored) as T;
      } catch {
        return defaultValue;
      }
    }
    return stored as T;
  });

  // Track current value in ref for synchronous access
  const valueRef = useRef(value);
  valueRef.current = value;

  // Wrapper setter: saves to localStorage BEFORE updating React state
  const setPersistedValue = useCallback((newValue: T | ((prev: T) => T)) => {
    const resolved = typeof newValue === 'function'
      ? (newValue as (prev: T) => T)(valueRef.current)
      : newValue;

    // Save synchronously FIRST
    if (typeof resolved === 'object') {
      setItem(key, JSON.stringify(resolved));
    } else {
      setItem(key, String(resolved));
    }

    // Then update React state
    setValue(resolved);
  }, [key]);

  return [value, setPersistedValue];
}

/**
 * A hook for persisting keyed values (like scroll positions per date).
 */
export function useKeyedPersisted<T>(
  prefix: string,
  defaultValue: T
): {
  get: (key: string) => T;
  set: (key: string, value: T) => void;
} {
  const get = useCallback((key: string): T => {
    const stored = getItem(`${prefix}_${key}`);
    if (stored === null) return defaultValue;

    if (typeof defaultValue === 'boolean') {
      return (stored === 'true') as T;
    }
    if (typeof defaultValue === 'number') {
      const num = parseFloat(stored);
      return (isNaN(num) ? defaultValue : num) as T;
    }
    if (typeof defaultValue === 'object') {
      try {
        return JSON.parse(stored) as T;
      } catch {
        return defaultValue;
      }
    }
    return stored as T;
  }, [prefix, defaultValue]);

  const set = useCallback((key: string, value: T): void => {
    if (typeof value === 'object') {
      setItem(`${prefix}_${key}`, JSON.stringify(value));
    } else {
      setItem(`${prefix}_${key}`, String(value));
    }
  }, [prefix]);

  return { get, set };
}

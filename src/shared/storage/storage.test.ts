import { describe, it, expect, beforeEach } from 'vitest';
import { getItem, setItem, removeItem, decryptValue, isStorageReady } from './index';

describe('localStorage storage abstraction', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setItem / getItem round-trip', () => {
    it('stores and retrieves a string', () => {
      setItem('testKey', 'testValue');
      expect(getItem('testKey')).toBe('testValue');
    });

    it('handles empty string values', () => {
      setItem('empty', '');
      expect(getItem('empty')).toBe('');
    });

    it('handles unicode and emoji', () => {
      const value = 'caf\u00e9 \ud83c\udf1e \u2764\ufe0f';
      setItem('unicode', value);
      expect(getItem('unicode')).toBe(value);
    });

    it('handles JSON strings', () => {
      const json = JSON.stringify({ key: 'value', num: 42, nested: { a: true } });
      setItem('json', json);
      expect(getItem('json')).toBe(json);
    });

    it('overwrites existing values', () => {
      setItem('key', 'first');
      setItem('key', 'second');
      expect(getItem('key')).toBe('second');
    });
  });

  describe('getItem', () => {
    it('returns null for missing keys', () => {
      expect(getItem('nonexistent')).toBeNull();
    });

    it('reads unencrypted legacy values as-is', () => {
      // Simulate a pre-encryption value (no $e: prefix)
      localStorage.setItem('legacy', 'plain value');
      expect(getItem('legacy')).toBe('plain value');
    });
  });

  describe('removeItem', () => {
    it('removes a stored item', () => {
      setItem('toRemove', 'value');
      removeItem('toRemove');
      expect(getItem('toRemove')).toBeNull();
    });

    it('does not throw when removing nonexistent key', () => {
      expect(() => removeItem('nope')).not.toThrow();
    });
  });

  describe('decryptValue', () => {
    it('returns unencrypted values unchanged', () => {
      expect(decryptValue('plain text')).toBe('plain text');
    });

    it('decrypts values with $e: prefix', () => {
      // Encrypt a value via setItem, read the raw localStorage, then decrypt
      setItem('test', 'hello');
      const raw = localStorage.getItem('test')!;
      expect(raw.startsWith('$e:')).toBe(true);
      expect(decryptValue(raw)).toBe('hello');
    });
  });

  describe('isStorageReady', () => {
    it('returns true (localStorage is always ready)', () => {
      expect(isStorageReady()).toBe(true);
    });
  });
});

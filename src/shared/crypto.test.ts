import { describe, it, expect } from 'vitest';
import {
  encryptWithKey,
  decryptWithKey,
  encryptText,
  decryptText,
  getAppEncryptKey,
  derivePasswordKey,
  exportKeyToJWK,
  importKeyFromJWK,
  parseEncryptedBackup,
  formatEncryptedBackup,
} from './crypto';

describe('crypto', () => {
  describe('encryptWithKey / decryptWithKey round-trip', () => {
    it('encrypts and decrypts back to original text', async () => {
      const key = await getAppEncryptKey();
      const plaintext = 'hello, good days!';
      const encrypted = await encryptWithKey(plaintext, key);
      const decrypted = await decryptWithKey(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext each time (random IV)', async () => {
      const key = await getAppEncryptKey();
      const plaintext = 'same text twice';
      const enc1 = await encryptWithKey(plaintext, key);
      const enc2 = await encryptWithKey(plaintext, key);
      expect(enc1).not.toBe(enc2);
    });

    it('handles empty string', async () => {
      const key = await getAppEncryptKey();
      const encrypted = await encryptWithKey('', key);
      const decrypted = await decryptWithKey(encrypted, key);
      expect(decrypted).toBe('');
    });

    it('handles unicode and emoji', async () => {
      const key = await getAppEncryptKey();
      const plaintext = 'caf\u00e9 \ud83c\udf1e journal entry \u2764\ufe0f';
      const encrypted = await encryptWithKey(plaintext, key);
      const decrypted = await decryptWithKey(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('throws when decrypting with wrong key', async () => {
      const key1 = await getAppEncryptKey();
      const key2 = await derivePasswordKey('wrong-password');
      const encrypted = await encryptWithKey('secret', key1);
      await expect(decryptWithKey(encrypted, key2)).rejects.toThrow();
    });
  });

  describe('encryptText / decryptText (backup encryption)', () => {
    it('round-trips correctly', async () => {
      const plaintext = JSON.stringify({ version: 2, entries: [] });
      const encrypted = await encryptText(plaintext);
      const decrypted = await decryptText(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('handles large content', async () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = await encryptText(plaintext);
      const decrypted = await decryptText(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('derivePasswordKey', () => {
    it('same password produces same key material', async () => {
      const key1 = await derivePasswordKey('mypassword');
      const key2 = await derivePasswordKey('mypassword');
      const jwk1 = await exportKeyToJWK(key1);
      const jwk2 = await exportKeyToJWK(key2);
      expect(jwk1.k).toBe(jwk2.k);
    });

    it('different passwords produce different keys', async () => {
      const key1 = await derivePasswordKey('password1');
      const key2 = await derivePasswordKey('password2');
      const jwk1 = await exportKeyToJWK(key1);
      const jwk2 = await exportKeyToJWK(key2);
      expect(jwk1.k).not.toBe(jwk2.k);
    });
  });

  describe('exportKeyToJWK / importKeyFromJWK', () => {
    it('round-trips a key and it still works for encryption', async () => {
      const originalKey = await getAppEncryptKey();
      const jwk = await exportKeyToJWK(originalKey);
      const importedKey = await importKeyFromJWK(jwk);

      const plaintext = 'test round trip with exported key';
      const encrypted = await encryptWithKey(plaintext, originalKey);
      const decrypted = await decryptWithKey(encrypted, importedKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('parseEncryptedBackup', () => {
    it('returns base64 content from a single line', () => {
      const base64 = 'A'.repeat(100);
      expect(parseEncryptedBackup(base64)).toBe(base64);
    });

    it('skips header lines and finds base64', () => {
      const content = `good days encrypted backup\n2026-01-15\n${'B'.repeat(100)}`;
      expect(parseEncryptedBackup(content)).toBe('B'.repeat(100));
    });

    it('returns null for empty string', () => {
      expect(parseEncryptedBackup('')).toBeNull();
    });

    it('returns null for short non-base64 content', () => {
      expect(parseEncryptedBackup('hello world')).toBeNull();
    });

    it('returns null for only header lines', () => {
      expect(parseEncryptedBackup('good days encrypted backup\n2026-01-15')).toBeNull();
    });

    it('handles base64 with padding characters', () => {
      const base64 = 'A'.repeat(99) + '=';
      expect(parseEncryptedBackup(base64)).toBe(base64);
    });
  });

  describe('formatEncryptedBackup', () => {
    it('returns the input unchanged (identity function)', () => {
      const content = 'some-encrypted-base64-content';
      expect(formatEncryptedBackup(content)).toBe(content);
    });
  });
});

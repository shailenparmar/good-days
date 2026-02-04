import { describe, it, expect, beforeEach } from 'vitest';
import { getItem, setItem, removeItem } from '@shared/storage';

describe('Auth storage behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('password storage', () => {
    const PASSWORD_KEY = 'passwordHash';
    const PASSWORD_SALT_KEY = 'passwordSalt';

    it('should return null when no password is set', () => {
      expect(getItem(PASSWORD_KEY)).toBeNull();
      expect(getItem(PASSWORD_SALT_KEY)).toBeNull();
    });

    it('should store and retrieve password hash', () => {
      setItem(PASSWORD_KEY, 'test-hash');
      setItem(PASSWORD_SALT_KEY, 'test-salt');

      expect(getItem(PASSWORD_KEY)).toBe('test-hash');
      expect(getItem(PASSWORD_SALT_KEY)).toBe('test-salt');
    });

    it('should handle password removal', () => {
      setItem(PASSWORD_KEY, 'test-hash');
      setItem(PASSWORD_SALT_KEY, 'test-salt');

      removeItem(PASSWORD_KEY);
      removeItem(PASSWORD_SALT_KEY);

      expect(getItem(PASSWORD_KEY)).toBeNull();
      expect(getItem(PASSWORD_SALT_KEY)).toBeNull();
    });

    it('should handle cross-tab password removal scenario', () => {
      // Simulate: password exists, then gets removed (like in another tab)
      setItem(PASSWORD_KEY, 'test-hash');
      setItem(PASSWORD_SALT_KEY, 'test-salt');

      // Verify it exists
      expect(getItem(PASSWORD_KEY)).toBe('test-hash');

      // Simulate another tab removing it
      localStorage.removeItem(PASSWORD_KEY);
      localStorage.removeItem(PASSWORD_SALT_KEY);

      // Now password check should fail gracefully
      const storedHash = getItem(PASSWORD_KEY);
      const storedSalt = getItem(PASSWORD_SALT_KEY);

      // The fix: when both are null, treat as "no password" not "wrong password"
      expect(storedHash).toBeNull();
      expect(storedSalt).toBeNull();
    });
  });

  describe('session storage', () => {
    const SESSION_UNLOCKED_KEY = 'sessionUnlocked';

    beforeEach(() => {
      sessionStorage.clear();
    });

    it('should track unlock state in session storage', () => {
      expect(sessionStorage.getItem(SESSION_UNLOCKED_KEY)).toBeNull();

      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      expect(sessionStorage.getItem(SESSION_UNLOCKED_KEY)).toBe('true');
    });

    it('should not persist unlock state across sessions', () => {
      // Session storage is cleared when the session ends
      // This test just verifies the pattern
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      sessionStorage.clear(); // Simulates session end
      expect(sessionStorage.getItem(SESSION_UNLOCKED_KEY)).toBeNull();
    });
  });
});

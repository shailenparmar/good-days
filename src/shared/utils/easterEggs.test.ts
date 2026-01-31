import { describe, it, expect, beforeEach } from 'vitest';
import { EASTER_EGGS, markEasterEggFound, getEasterEggCount } from './easterEggs';

describe('easterEggs', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('EASTER_EGGS', () => {
    it('should have exactly 13 easter eggs', () => {
      expect(EASTER_EGGS.length).toBe(13);
    });

    it('should contain all expected easter eggs', () => {
      const expectedEggs = [
        'scrambleTyping',
        'powerstatMode',
        'supermode',
        'scrambleHotkeyOn',
        'minizenMode',
        'zenMode',
        'timeCommand',
        'scrambleHotkeyUsed',
        'spacebarRand',
        'arrowKeyPresets',
        'copyMarkdown',
        'selectColorText',
        'mobileRand',
      ];

      expectedEggs.forEach(egg => {
        expect(EASTER_EGGS).toContain(egg);
      });
    });

    it('should have no duplicate easter eggs', () => {
      const uniqueEggs = new Set(EASTER_EGGS);
      expect(uniqueEggs.size).toBe(EASTER_EGGS.length);
    });
  });

  describe('getEasterEggCount', () => {
    it('should return 0 found and 13 total when no eggs found', () => {
      const count = getEasterEggCount();
      expect(count.found).toBe(0);
      expect(count.total).toBe(13);
    });

    it('should return correct count after finding eggs', () => {
      markEasterEggFound('scrambleTyping');
      markEasterEggFound('zenMode');

      const count = getEasterEggCount();
      expect(count.found).toBe(2);
      expect(count.total).toBe(13);
    });
  });

  describe('markEasterEggFound', () => {
    it('should persist easter egg to localStorage', () => {
      markEasterEggFound('scrambleTyping');

      const saved = localStorage.getItem('easterEggsFound');
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed).toContain('scrambleTyping');
    });

    it('should not duplicate easter eggs when marked multiple times', () => {
      markEasterEggFound('zenMode');
      markEasterEggFound('zenMode');
      markEasterEggFound('zenMode');

      const count = getEasterEggCount();
      expect(count.found).toBe(1);
    });

    it('should handle marking all easter eggs', () => {
      EASTER_EGGS.forEach(egg => {
        markEasterEggFound(egg);
      });

      const count = getEasterEggCount();
      expect(count.found).toBe(13);
      expect(count.total).toBe(13);
    });

    it('should persist across multiple calls', () => {
      markEasterEggFound('scrambleTyping');
      markEasterEggFound('powerstatMode');
      markEasterEggFound('supermode');

      // Simulate a "page refresh" by reading fresh from localStorage
      const count = getEasterEggCount();
      expect(count.found).toBe(3);
    });
  });

  describe('localStorage edge cases', () => {
    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('easterEggsFound', 'not-valid-json');

      // Should not throw, should return 0 found
      const count = getEasterEggCount();
      expect(count.found).toBe(0);
    });

    it('should handle empty localStorage', () => {
      const count = getEasterEggCount();
      expect(count.found).toBe(0);
      expect(count.total).toBe(13);
    });
  });
});

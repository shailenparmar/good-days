import { describe, it, expect } from 'vitest';
import { scrambleChar, scrambleText, setScrambleSeed } from './scramble';

describe('scramble', () => {
  describe('scrambleChar', () => {
    it('replaces lowercase letters with lowercase letters', () => {
      for (let i = 0; i < 50; i++) {
        const result = scrambleChar('a');
        expect(result).toMatch(/^[a-z]$/);
      }
    });

    it('replaces uppercase letters with uppercase letters', () => {
      for (let i = 0; i < 50; i++) {
        const result = scrambleChar('A');
        expect(result).toMatch(/^[A-Z]$/);
      }
    });

    it('replaces digits with digits', () => {
      for (let i = 0; i < 50; i++) {
        const result = scrambleChar('5');
        expect(result).toMatch(/^[0-9]$/);
      }
    });

    it('passes through non-alphanumeric characters unchanged', () => {
      expect(scrambleChar(' ')).toBe(' ');
      expect(scrambleChar('!')).toBe('!');
      expect(scrambleChar('.')).toBe('.');
      expect(scrambleChar('\n')).toBe('\n');
    });
  });

  describe('scrambleText', () => {
    it('is deterministic with the same seed and text', () => {
      setScrambleSeed(42);
      const result1 = scrambleText('hello world');
      setScrambleSeed(42);
      const result2 = scrambleText('hello world');
      expect(result1).toBe(result2);
    });

    it('produces different output with different seeds', () => {
      setScrambleSeed(1);
      const result1 = scrambleText('hello world');
      setScrambleSeed(2);
      const result2 = scrambleText('hello world');
      expect(result1).not.toBe(result2);
    });

    it('produces different output for different text with same seed', () => {
      setScrambleSeed(42);
      const result1 = scrambleText('hello');
      setScrambleSeed(42);
      const result2 = scrambleText('world');
      expect(result1).not.toBe(result2);
    });

    it('preserves string length', () => {
      setScrambleSeed(42);
      const text = 'Hello, World! 123';
      expect(scrambleText(text).length).toBe(text.length);
    });

    it('preserves non-alphanumeric characters', () => {
      setScrambleSeed(42);
      const result = scrambleText('a, b! c?');
      expect(result[1]).toBe(',');
      expect(result[2]).toBe(' ');
      expect(result[4]).toBe('!');
      expect(result[5]).toBe(' ');
      expect(result[7]).toBe('?');
    });

    it('preserves case', () => {
      setScrambleSeed(42);
      const text = 'Hello';
      const result = scrambleText(text);
      expect(result[0]).toMatch(/^[A-Z]$/); // H was uppercase
      expect(result[1]).toMatch(/^[a-z]$/); // e was lowercase
    });

    it('handles empty string', () => {
      setScrambleSeed(42);
      expect(scrambleText('')).toBe('');
    });

    it('passes through unicode/emoji unchanged', () => {
      setScrambleSeed(42);
      const result = scrambleText('\u2764\ufe0f\ud83c\udf1e');
      // Non-alphanumeric chars pass through
      expect(result).toBe('\u2764\ufe0f\ud83c\udf1e');
    });
  });
});

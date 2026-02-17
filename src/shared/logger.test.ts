import { describe, it, expect, beforeEach } from 'vitest';
import { logAction, exportLogs, clearLogs } from './logger';

const STORAGE_KEY = 'gdays_actionLog';

describe('logger', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('logAction', () => {
    it('creates a log entry in localStorage', () => {
      logAction('test.event');
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const logs = JSON.parse(raw!);
      expect(logs).toHaveLength(1);
      expect(logs[0].e).toBe('test.event');
      expect(typeof logs[0].t).toBe('number');
    });

    it('includes data when provided', () => {
      logAction('test.event', { key: 'value' });
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(logs[0].d).toEqual({ key: 'value' });
    });

    it('omits data field when not provided', () => {
      logAction('test.event');
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(logs[0].d).toBeUndefined();
    });

    it('appends to existing logs', () => {
      logAction('event.1');
      logAction('event.2');
      logAction('event.3');
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(logs).toHaveLength(3);
      expect(logs[0].e).toBe('event.1');
      expect(logs[2].e).toBe('event.3');
    });

    it('trims to MAX_ENTRIES (500) when buffer overflows', () => {
      // Pre-fill with 500 entries
      const preFill = Array.from({ length: 500 }, (_, i) => ({
        t: Date.now(),
        e: `event.${i}`,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preFill));

      // Add one more — should trim oldest
      logAction('event.overflow');
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(logs).toHaveLength(500);
      expect(logs[0].e).toBe('event.1'); // event.0 was trimmed
      expect(logs[499].e).toBe('event.overflow');
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json!!!');
      // Should not throw
      expect(() => logAction('after.corruption')).not.toThrow();
      // Should start fresh
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(logs).toHaveLength(1);
      expect(logs[0].e).toBe('after.corruption');
    });

    it('handles non-array JSON in localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));
      expect(() => logAction('test')).not.toThrow();
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(logs).toHaveLength(1);
    });
  });

  describe('exportLogs', () => {
    it('includes header with version and entry count', () => {
      const result = exportLogs('2.5.0', 42);
      expect(result).toContain('good days debug log');
      expect(result).toContain('app version: 2.5.0');
      expect(result).toContain('entries in storage: 42');
      expect(result).toContain('log events: 0');
    });

    it('formats log entries as [ISO] event data', () => {
      logAction('test.event', { count: 5 });
      const result = exportLogs('2.5.0', 1);
      expect(result).toContain('test.event');
      expect(result).toContain('"count":5');
      // ISO timestamp format
      expect(result).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    });

    it('works with no log entries', () => {
      const result = exportLogs('1.0.0', 0);
      expect(result).toContain('log events: 0');
      expect(result).toContain('---');
    });
  });

  describe('clearLogs', () => {
    it('removes the log key from localStorage', () => {
      logAction('something');
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      clearLogs();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});

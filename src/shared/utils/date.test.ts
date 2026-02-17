import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimeSpent, formatTimestamp, formatDate, getTodayDate, getTimeUntilMidnight } from './date';

describe('date utilities', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatTimeSpent', () => {
    it('formats 0 seconds', () => {
      expect(formatTimeSpent(0)).toBe('0s active');
    });

    it('formats seconds only', () => {
      expect(formatTimeSpent(45)).toBe('45s active');
    });

    it('formats minutes and seconds', () => {
      expect(formatTimeSpent(60)).toBe('1m 0s active');
      expect(formatTimeSpent(90)).toBe('1m 30s active');
    });

    it('formats hours, minutes, and seconds', () => {
      expect(formatTimeSpent(3600)).toBe('1h 0m 0s active');
      expect(formatTimeSpent(3661)).toBe('1h 1m 1s active');
    });

    it('handles large values', () => {
      expect(formatTimeSpent(86400)).toBe('24h 0m 0s active');
    });

    it('boundary: 59 seconds stays in seconds-only format', () => {
      expect(formatTimeSpent(59)).toBe('59s active');
    });

    it('boundary: 3599 seconds stays in minutes format', () => {
      expect(formatTimeSpent(3599)).toBe('59m 59s active');
    });
  });

  describe('formatTimestamp', () => {
    it('pads hours, minutes, seconds to 2 digits', () => {
      // Create a date at 1:02:03 local time
      const date = new Date(2026, 0, 1, 1, 2, 3);
      expect(formatTimestamp(date.getTime())).toBe('01:02:03');
    });

    it('formats noon correctly', () => {
      const date = new Date(2026, 0, 1, 12, 0, 0);
      expect(formatTimestamp(date.getTime())).toBe('12:00:00');
    });

    it('formats 23:59:59', () => {
      const date = new Date(2026, 0, 1, 23, 59, 59);
      expect(formatTimestamp(date.getTime())).toBe('23:59:59');
    });
  });

  describe('getTodayDate', () => {
    it('returns YYYY-MM-DD format', () => {
      const result = getTodayDate();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns correct date for a mocked time', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 1, 16, 15, 30, 0)); // Feb 16, 2026
      expect(getTodayDate()).toBe('2026-02-16');
      vi.useRealTimers();
    });

    it('pads single-digit months and days', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 5)); // Jan 5
      expect(getTodayDate()).toBe('2026-01-05');
      vi.useRealTimers();
    });
  });

  describe('formatDate', () => {
    it('returns "today" for today\'s date', () => {
      const today = getTodayDate();
      expect(formatDate(today)).toBe('today');
    });

    it('returns "yesterday" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      expect(formatDate(`${y}-${m}-${d}`)).toBe('yesterday');
    });

    it('returns a localized date string for older dates', () => {
      const result = formatDate('2020-01-15');
      // Should be something like "jan 15, 2020" (lowercase)
      expect(result).toContain('2020');
      expect(result).toMatch(/jan/i);
      expect(result).toBe(result.toLowerCase());
    });
  });

  describe('getTimeUntilMidnight', () => {
    it('returns format Xh Ym Zs', () => {
      const result = getTimeUntilMidnight();
      expect(result).toMatch(/^\d+h \d+m \d+s$/);
    });

    it('returns correct values near midnight', () => {
      vi.useFakeTimers();
      // Set to 11:59:00 PM
      vi.setSystemTime(new Date(2026, 1, 16, 23, 59, 0));
      expect(getTimeUntilMidnight()).toBe('0h 1m 0s');
      vi.useRealTimers();
    });
  });
});

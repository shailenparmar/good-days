import { describe, it, expect } from 'vitest';
import { formatEntriesAsJson, formatEntriesAsText, formatEntriesForClipboard } from './formatEntries';
import { parseBackupJson, isV3Backup } from './parseBackup';
import type { JournalEntry } from '@features/journal';

const sampleEntries: JournalEntry[] = [
  { date: '2026-01-15', content: '<div>Entry one</div>', title: 'morning', startedAt: 1737000000000, lastModified: 1737000100000 },
  { date: '2026-01-10', content: '<div>Entry two</div>', lastModified: 1736500000000 },
  { date: '2026-01-20', content: '<div>Entry three</div>' },
];

describe('formatEntriesAsJson', () => {
  it('produces valid JSON', () => {
    const json = formatEntriesAsJson(sampleEntries);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes version 2 and exportedAt', () => {
    const json = formatEntriesAsJson(sampleEntries);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(typeof parsed.exportedAt).toBe('number');
  });

  it('sorts entries oldest-first', () => {
    const json = formatEntriesAsJson(sampleEntries);
    const parsed = JSON.parse(json);
    expect(parsed.entries[0].date).toBe('2026-01-10');
    expect(parsed.entries[1].date).toBe('2026-01-15');
    expect(parsed.entries[2].date).toBe('2026-01-20');
  });

  it('includes presets when provided', () => {
    const presets = [{ hue: 100, sat: 50, light: 50, bgHue: 0, bgSat: 0, bgLight: 100 }];
    const json = formatEntriesAsJson(sampleEntries, presets);
    const parsed = JSON.parse(json);
    expect(parsed.presets).toHaveLength(1);
  });

  it('handles empty entries array', () => {
    const json = formatEntriesAsJson([]);
    const parsed = JSON.parse(json);
    expect(parsed.entries).toHaveLength(0);
  });
});

describe('formatEntriesAsJson + parseBackupJson round-trip', () => {
  it('exports then re-imports losslessly', () => {
    const json = formatEntriesAsJson(sampleEntries);
    const parsed = parseBackupJson(json);
    expect(parsed).not.toBeNull();
    expect(isV3Backup(parsed!)).toBe(false);
    if (!isV3Backup(parsed!)) {
      expect(parsed!.entries).toHaveLength(3);
      // Verify sorted oldest-first in JSON
      expect(parsed!.entries[0].date).toBe('2026-01-10');
      // Verify fields preserved
      expect(parsed!.entries[1].title).toBe('morning');
      expect(parsed!.entries[1].startedAt).toBe(1737000000000);
    }
  });

  it('round-trips presets', () => {
    const presets = [{ hue: 120, sat: 80, light: 30, bgHue: 50, bgSat: 100, bgLight: 90 }];
    const customPresets = [{ hue: 200, sat: 60, light: 40, bgHue: 20, bgSat: 80, bgLight: 95 }];
    const json = formatEntriesAsJson(sampleEntries, presets, customPresets);
    const parsed = parseBackupJson(json);
    expect(isV3Backup(parsed!)).toBe(false);
    if (!isV3Backup(parsed!)) {
      expect(parsed!.presets).toHaveLength(1);
      expect(parsed!.presets![0].hue).toBe(120);
      expect(parsed!.customPresets).toHaveLength(1);
      expect(parsed!.customPresets![0].hue).toBe(200);
    }
  });
});

describe('formatEntriesForClipboard', () => {
  it('returns empty string for no entries', () => {
    expect(formatEntriesForClipboard([])).toBe('');
  });

  it('sorts entries newest-first', () => {
    const result = formatEntriesForClipboard(sampleEntries);
    const lines = result.split('\n');
    // Newest date (Jan 20) should appear first
    expect(lines[0]).toContain('January 20');
  });

  it('includes entry title when present', () => {
    const result = formatEntriesForClipboard(sampleEntries);
    expect(result).toContain('morning');
  });

  it('strips HTML and produces plain text', () => {
    const result = formatEntriesForClipboard(sampleEntries);
    expect(result).not.toContain('<div>');
    expect(result).toContain('Entry one');
  });
});

describe('formatEntriesAsText (legacy markdown)', () => {
  it('returns empty string for no entries', () => {
    expect(formatEntriesAsText([])).toBe('');
  });

  it('includes header and date headers', () => {
    const result = formatEntriesAsText(sampleEntries);
    expect(result).toContain('# good days');
    expect(result).toContain('## ');
  });

  it('sorts entries oldest-first', () => {
    const result = formatEntriesAsText(sampleEntries);
    const jan10Pos = result.indexOf('January 10');
    const jan20Pos = result.indexOf('January 20');
    expect(jan10Pos).toBeLessThan(jan20Pos);
  });

  it('includes title as bold markdown', () => {
    const result = formatEntriesAsText(sampleEntries);
    expect(result).toContain('**morning**');
  });

  it('includes started at time', () => {
    const result = formatEntriesAsText(sampleEntries);
    expect(result).toContain('*Started at');
  });
});

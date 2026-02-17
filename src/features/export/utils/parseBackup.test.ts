import { describe, it, expect } from 'vitest';
import { parseBackupJson, mergeJsonEntries, parseBackupText, mergeEntries } from './parseBackup';
import type { JournalEntry } from '@features/journal';

describe('parseBackupJson', () => {
  it('parses a valid v2 backup', () => {
    const json = JSON.stringify({
      version: 2,
      exportedAt: Date.now(),
      entries: [{ date: '2026-01-15', content: 'hello' }],
      presets: [{ hue: 100, sat: 50, light: 50, bgHue: 0, bgSat: 0, bgLight: 100 }],
      customPresets: [],
    });
    const result = parseBackupJson(json);
    expect(result).not.toBeNull();
    expect(result!.entries).toHaveLength(1);
    expect(result!.presets).toHaveLength(1);
    expect(result!.customPresets).toHaveLength(0);
  });

  it('parses a valid v1 backup (no presets)', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      entries: [{ date: '2026-01-15', content: 'hello' }],
    });
    const result = parseBackupJson(json);
    expect(result).not.toBeNull();
    expect(result!.entries).toHaveLength(1);
    expect(result!.presets).toBeNull();
    expect(result!.customPresets).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parseBackupJson('not json at all')).toBeNull();
  });

  it('returns null for valid JSON without version', () => {
    expect(parseBackupJson(JSON.stringify({ entries: [] }))).toBeNull();
  });

  it('returns null for valid JSON without entries array', () => {
    expect(parseBackupJson(JSON.stringify({ version: 1 }))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseBackupJson('{broken')).toBeNull();
  });

  it('returns null for JSON with non-number version', () => {
    expect(parseBackupJson(JSON.stringify({ version: '1', entries: [] }))).toBeNull();
  });
});

describe('mergeJsonEntries', () => {
  const ts = 1700000000000;

  it('adds new entries for dates that do not exist', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: 'existing' },
    ];
    const imported: JournalEntry[] = [
      { date: '2026-01-15', content: 'new entry' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.importedCount).toBe(1);
    expect(result.entries).toHaveLength(2);
  });

  it('skips exact duplicates (same content and title)', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: 'hello', title: 'morning' },
    ];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: 'hello', title: 'morning' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.importedCount).toBe(0);
    expect(result.entries).toHaveLength(1);
  });

  it('appends conflicting entries with --- separator', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: 'original content' },
    ];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: 'different content' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.importedCount).toBe(1);
    const merged = result.entries.find(e => e.date === '2026-01-10')!;
    expect(merged.content).toContain('original content');
    expect(merged.content).toContain('---');
    expect(merged.content).toContain('different content');
  });

  it('skips empty imports', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: 'hello' },
    ];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: '' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.importedCount).toBe(0);
  });

  it('uses earlier startedAt timestamp', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: 'a', startedAt: 2000 },
    ];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: 'b', startedAt: 1000 },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    const merged = result.entries.find(e => e.date === '2026-01-10')!;
    expect(merged.startedAt).toBe(1000);
  });

  it('sorts result newest-first', () => {
    const existing: JournalEntry[] = [];
    const imported: JournalEntry[] = [
      { date: '2026-01-01', content: 'old' },
      { date: '2026-01-15', content: 'new' },
      { date: '2026-01-10', content: 'mid' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.entries[0].date).toBe('2026-01-15');
    expect(result.entries[1].date).toBe('2026-01-10');
    expect(result.entries[2].date).toBe('2026-01-01');
  });

  it('preserves original lastModified for new entries that have it', () => {
    const existing: JournalEntry[] = [];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: 'hello', lastModified: 5000 },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.entries[0].lastModified).toBe(5000);
  });

  it('uses import timestamp for new entries without lastModified', () => {
    const existing: JournalEntry[] = [];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: 'hello' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.entries[0].lastModified).toBe(ts);
  });

  it('does not duplicate on re-import of previously appended content', () => {
    // Simulate first import that appended (content matches real merge separator)
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: 'original\n\n--- [from backup] ---\n\ndifferent' },
    ];
    const imported: JournalEntry[] = [
      { date: '2026-01-10', content: 'different' },
    ];
    const result = mergeJsonEntries(existing, imported, ts);
    expect(result.importedCount).toBe(0);
  });
});

describe('parseBackupText', () => {
  it('parses a well-formed legacy markdown backup', () => {
    const text = `# good days

---

## Monday, January 27, 2025

Hello world, this is my entry.

## Tuesday, January 28, 2025

Another day, another entry.`;

    const entries = parseBackupText(text);
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe('2025-01-27');
    expect(entries[0].content).toContain('Hello world');
    expect(entries[1].date).toBe('2025-01-28');
  });

  it('extracts startedAt from *Started at HH:MM:SS*', () => {
    const text = `## Monday, January 27, 2025

*Started at 09:30:00*

Some content here.`;

    const entries = parseBackupText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].startedAt).toBeDefined();
    expect(entries[0].content).toBe('Some content here.');
    expect(entries[0].content).not.toContain('Started at');
  });

  it('handles entries without startedAt', () => {
    const text = `## Monday, January 27, 2025

Just text, no timestamp.`;

    const entries = parseBackupText(text);
    expect(entries[0].startedAt).toBeUndefined();
    expect(entries[0].content).toContain('Just text');
  });

  it('returns empty array for text with no date headers', () => {
    expect(parseBackupText('just some random text')).toHaveLength(0);
  });

  it('handles date without day name', () => {
    // The regex requires the full "## DayName, Month Day, Year" format
    // A header without the correct format should be ignored
    const text = `## 2025-01-27

some content`;
    expect(parseBackupText(text)).toHaveLength(0);
  });
});

describe('mergeEntries (legacy)', () => {
  const ts = 1700000000000;

  it('adds new entries as HTML divs', () => {
    const existing: JournalEntry[] = [];
    const imported = [{ date: '2026-01-10', content: 'hello\nworld' }];
    const result = mergeEntries(existing, imported, ts);
    expect(result.importedCount).toBe(1);
    expect(result.entries[0].content).toContain('<div>');
  });

  it('skips exact duplicate content', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: '<div>hello</div>' },
    ];
    const imported = [{ date: '2026-01-10', content: 'hello' }];
    const result = mergeEntries(existing, imported, ts);
    expect(result.importedCount).toBe(0);
  });

  it('appends different content with --- separator', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: '<div>original</div>' },
    ];
    const imported = [{ date: '2026-01-10', content: 'different' }];
    const result = mergeEntries(existing, imported, ts);
    expect(result.importedCount).toBe(1);
    const merged = result.entries.find(e => e.date === '2026-01-10')!;
    expect(merged.content).toContain('---');
    expect(merged.content).toContain('different');
  });

  it('skips empty imports', () => {
    const existing: JournalEntry[] = [
      { date: '2026-01-10', content: '<div>hello</div>' },
    ];
    const imported = [{ date: '2026-01-10', content: '' }];
    const result = mergeEntries(existing, imported, ts);
    expect(result.importedCount).toBe(0);
  });
});

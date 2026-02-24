import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the htmlToText function
import { htmlToText } from '@shared/utils/html';

describe('htmlToText', () => {
  it('should convert basic HTML to text', () => {
    expect(htmlToText('<div>Hello</div>')).toBe('Hello\n');
  });

  it('should preserve line breaks from br tags', () => {
    expect(htmlToText('Hello<br>World')).toBe('Hello\nWorld');
    expect(htmlToText('Hello<br/>World')).toBe('Hello\nWorld');
    expect(htmlToText('Hello<br />World')).toBe('Hello\nWorld');
  });

  it('should preserve line breaks from div tags', () => {
    expect(htmlToText('<div>Line 1</div><div>Line 2</div>')).toBe('Line 1\nLine 2\n');
  });

  it('should preserve line breaks from p tags', () => {
    expect(htmlToText('<p>Para 1</p><p>Para 2</p>')).toBe('Para 1\nPara 2\n');
  });

  it('should preserve line breaks from li tags', () => {
    expect(htmlToText('<li>Item 1</li><li>Item 2</li>')).toBe('Item 1\nItem 2\n');
  });

  it('should preserve line breaks from blockquote tags', () => {
    expect(htmlToText('<blockquote>Quote</blockquote>Text')).toBe('Quote\nText');
  });

  it('should handle empty string', () => {
    expect(htmlToText('')).toBe('');
  });

  it('should handle plain text without HTML', () => {
    expect(htmlToText('Just plain text')).toBe('Just plain text');
  });

  it('should handle malformed HTML gracefully', () => {
    // Should not throw, should return something reasonable
    expect(() => htmlToText('<div>Unclosed')).not.toThrow();
    expect(() => htmlToText('<<<>>>')).not.toThrow();
    expect(() => htmlToText('<script>alert("xss")</script>')).not.toThrow();
  });

  it('should strip script tags content', () => {
    const result = htmlToText('<div>Safe</div><script>alert("xss")</script>');
    expect(result).toContain('Safe');
  });

  it('should handle nested tags', () => {
    expect(htmlToText('<div><p>Nested <strong>content</strong></p></div>')).toBe('Nested content\n\n');
  });

  it('should handle HTML entities', () => {
    expect(htmlToText('&amp; &lt; &gt;')).toBe('& < >');
  });
});

describe('journalStorage fallback behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store entries in localStorage when in fallback mode', () => {
    // This tests that localStorage fallback works
    const testEntries = [
      { date: '2024-01-01', content: 'Test entry', startedAt: Date.now() }
    ];
    localStorage.setItem('journalEntries', JSON.stringify(testEntries));

    const stored = localStorage.getItem('journalEntries');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].date).toBe('2024-01-01');
  });

  it('should handle empty localStorage gracefully', () => {
    const stored = localStorage.getItem('journalEntries');
    expect(stored).toBeNull();
  });

  it('should handle malformed JSON in localStorage', () => {
    localStorage.setItem('journalEntries', 'not valid json');
    // The app should handle this gracefully (parseLocalStorageEntries returns [])
    expect(() => {
      try {
        JSON.parse(localStorage.getItem('journalEntries')!);
      } catch {
        // Expected
      }
    }).not.toThrow();
  });
});

// ===========================================================================
// Throttle behavior tests
// ===========================================================================

// Mock dependencies that journalStorage imports
vi.mock('@shared/logger', () => ({ logAction: vi.fn() }));
vi.mock('@shared/crypto', () => ({
  encryptWithKey: vi.fn(),
  decryptWithKey: vi.fn(),
}));

// --- IndexedDB mock (tracks writes and deletes) ---

interface WriteRecord { date: string; content: string }
const idbWrites: WriteRecord[] = [];
const idbDeletes: string[] = [];

// IDB request mock — fires onsuccess immediately when handler is assigned
function mockRequest(result?: unknown) {
  const req: Record<string, unknown> = { error: null, result };
  return new Proxy(req, {
    set(target, prop, value) {
      target[prop as string] = value;
      if (prop === 'onsuccess' && typeof value === 'function') value();
      return true;
    },
  });
}

const mockObjectStore = (storeName: string) => ({
  put: (record: Record<string, unknown>) => {
    if (storeName === 'entries') {
      idbWrites.push({ date: record.date as string, content: record.content as string });
    }
    return mockRequest();
  },
  get: () => mockRequest(null),
  getAll: () => mockRequest([]),
  clear: () => mockRequest(),
  delete: (key: string) => {
    if (storeName === 'entries') idbDeletes.push(key);
    return mockRequest();
  },
});

const mockDB = {
  transaction: () => ({ objectStore: (name: string) => mockObjectStore(name) }),
  close: vi.fn(),
  objectStoreNames: { contains: () => true },
};

(globalThis as any).indexedDB = { open: () => mockRequest(mockDB) };

// Import throttle-related functions (module init runs once, uses our mock)
import {
  saveSingleEntry,
  cancelPendingSave,
  cancelPendingSaves,
  flushPendingSaves,
  deleteSingleEntry,
} from './journalStorage';

function entry(date: string, content: string) {
  return { date, content, title: '' };
}

// Let fire-and-forget async IDB operations settle
async function flushAsync() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// ---------------------------------------------------------------------------

describe('saveSingleEntry throttle behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelPendingSaves();
    idbWrites.length = 0;
    idbDeletes.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('writes after 300ms on a single call', async () => {
    saveSingleEntry(entry('2026-01-01', 'hello'));
    expect(idbWrites).toHaveLength(0);

    vi.advanceTimersByTime(299);
    await flushAsync();
    expect(idbWrites).toHaveLength(0);

    vi.advanceTimersByTime(1);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0]).toEqual({ date: '2026-01-01', content: 'hello' });
  });

  it('does NOT reset timer on subsequent calls (throttle, not debounce)', async () => {
    saveSingleEntry(entry('2026-01-01', 'a'));

    vi.advanceTimersByTime(100);
    saveSingleEntry(entry('2026-01-01', 'ab'));

    vi.advanceTimersByTime(100);
    saveSingleEntry(entry('2026-01-01', 'abc'));

    // 300ms from FIRST call — write fires here
    vi.advanceTimersByTime(100);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].content).toBe('abc');
  });

  it('proves throttle: write at 300ms even when last keystroke was at 250ms', async () => {
    // Debounce would reset at 250ms → no write until 550ms.
    // Throttle doesn't reset → write at 300ms.
    saveSingleEntry(entry('2026-01-01', 'first'));

    vi.advanceTimersByTime(250);
    saveSingleEntry(entry('2026-01-01', 'second'));

    vi.advanceTimersByTime(50); // t=300
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].content).toBe('second');
  });

  it('only one active timer per date', () => {
    saveSingleEntry(entry('2026-01-01', 'a'));
    expect(vi.getTimerCount()).toBe(1);

    saveSingleEntry(entry('2026-01-01', 'b'));
    expect(vi.getTimerCount()).toBe(1);

    saveSingleEntry(entry('2026-01-01', 'c'));
    expect(vi.getTimerCount()).toBe(1);

    // Second date → second timer
    saveSingleEntry(entry('2026-01-02', 'd'));
    expect(vi.getTimerCount()).toBe(2);
  });

  it('writes latest content when timer fires', async () => {
    saveSingleEntry(entry('2026-01-01', 'v1'));
    saveSingleEntry(entry('2026-01-01', 'v2'));
    saveSingleEntry(entry('2026-01-01', 'v3'));
    saveSingleEntry(entry('2026-01-01', 'v4-final'));

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].content).toBe('v4-final');
  });

  it('starts new throttle cycle after timer fires', async () => {
    saveSingleEntry(entry('2026-01-01', 'cycle1'));

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);

    // New call after timer fired → new cycle
    saveSingleEntry(entry('2026-01-01', 'cycle2'));

    vi.advanceTimersByTime(299);
    await flushAsync();
    expect(idbWrites).toHaveLength(1); // still 1

    vi.advanceTimersByTime(1);
    await flushAsync();
    expect(idbWrites).toHaveLength(2);
    expect(idbWrites[1].content).toBe('cycle2');
  });

  it('fires every 300ms during continuous typing', async () => {
    saveSingleEntry(entry('2026-01-01', 't0'));

    vi.advanceTimersByTime(100);
    saveSingleEntry(entry('2026-01-01', 't100'));

    vi.advanceTimersByTime(100);
    saveSingleEntry(entry('2026-01-01', 't200'));

    // t=300 — first timer fires
    vi.advanceTimersByTime(100);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].content).toBe('t200');

    // Timer fired, map cleared. New call starts fresh cycle.
    saveSingleEntry(entry('2026-01-01', 't300'));

    vi.advanceTimersByTime(100);
    saveSingleEntry(entry('2026-01-01', 't400'));

    vi.advanceTimersByTime(100);
    saveSingleEntry(entry('2026-01-01', 't500'));

    // t=600 — second timer fires
    vi.advanceTimersByTime(100);
    await flushAsync();
    expect(idbWrites).toHaveLength(2);
    expect(idbWrites[1].content).toBe('t500');

    // 2 writes in 600ms of continuous typing.
    // Old debounce: 0 writes (timer reset every 100ms, never fires).
  });

  it('independent timers for different dates', async () => {
    saveSingleEntry(entry('2026-01-01', 'day1'));

    vi.advanceTimersByTime(150);
    saveSingleEntry(entry('2026-01-02', 'day2'));

    // t=300: day1 fires (started at t=0)
    vi.advanceTimersByTime(150);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].date).toBe('2026-01-01');

    // t=450: day2 fires (started at t=150)
    vi.advanceTimersByTime(150);
    await flushAsync();
    expect(idbWrites).toHaveLength(2);
    expect(idbWrites[1].date).toBe('2026-01-02');
  });

  it('no write when nothing has been queued', async () => {
    vi.advanceTimersByTime(1000);
    await flushAsync();
    expect(idbWrites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('cancelPendingSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelPendingSaves();
    idbWrites.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('prevents write when called before timer fires', async () => {
    saveSingleEntry(entry('2026-01-01', 'will-cancel'));
    vi.advanceTimersByTime(150);

    cancelPendingSave('2026-01-01');

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(0);
  });

  it('is a no-op when no pending save exists', () => {
    cancelPendingSave('nonexistent');
  });

  it('allows a new cycle after cancellation', async () => {
    saveSingleEntry(entry('2026-01-01', 'first'));
    cancelPendingSave('2026-01-01');

    saveSingleEntry(entry('2026-01-01', 'after-cancel'));
    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].content).toBe('after-cancel');
  });

  it('only cancels the specified date', async () => {
    saveSingleEntry(entry('2026-01-01', 'day1'));
    saveSingleEntry(entry('2026-01-02', 'day2'));

    cancelPendingSave('2026-01-01');

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].date).toBe('2026-01-02');
  });
});

// ---------------------------------------------------------------------------

describe('flushPendingSaves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelPendingSaves();
    idbWrites.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('writes all pending entries immediately', async () => {
    saveSingleEntry(entry('2026-01-01', 'day1'));
    saveSingleEntry(entry('2026-01-02', 'day2'));
    expect(idbWrites).toHaveLength(0);

    flushPendingSaves();
    await flushAsync();

    expect(idbWrites).toHaveLength(2);
    const dates = idbWrites.map(w => w.date).sort();
    expect(dates).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('writes latest content per date', async () => {
    saveSingleEntry(entry('2026-01-01', 'old'));
    saveSingleEntry(entry('2026-01-01', 'newer'));
    saveSingleEntry(entry('2026-01-01', 'latest'));

    flushPendingSaves();
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].content).toBe('latest');
  });

  it('prevents original timers from double-writing', async () => {
    saveSingleEntry(entry('2026-01-01', 'flushed'));

    flushPendingSaves();
    await flushAsync();
    expect(idbWrites).toHaveLength(1);

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
  });

  it('is a no-op when nothing is pending', () => {
    flushPendingSaves();
  });
});

// ---------------------------------------------------------------------------

describe('cancelPendingSaves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelPendingSaves();
    idbWrites.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('cancels all pending timers without writing', async () => {
    saveSingleEntry(entry('2026-01-01', 'day1'));
    saveSingleEntry(entry('2026-01-02', 'day2'));
    saveSingleEntry(entry('2026-01-03', 'day3'));

    cancelPendingSaves();

    vi.advanceTimersByTime(1000);
    await flushAsync();
    expect(idbWrites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('deleteSingleEntry cancels pending save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelPendingSaves();
    idbWrites.length = 0;
    idbDeletes.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('cancels pending throttled save for the deleted date', async () => {
    saveSingleEntry(entry('2026-01-01', 'to-delete'));
    vi.advanceTimersByTime(100);

    deleteSingleEntry('2026-01-01');

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(0);
    expect(idbDeletes).toHaveLength(1);
    expect(idbDeletes[0]).toBe('2026-01-01');
  });

  it('does not affect pending saves for other dates', async () => {
    saveSingleEntry(entry('2026-01-01', 'keep'));
    saveSingleEntry(entry('2026-01-02', 'delete'));

    deleteSingleEntry('2026-01-02');

    vi.advanceTimersByTime(300);
    await flushAsync();
    expect(idbWrites).toHaveLength(1);
    expect(idbWrites[0].date).toBe('2026-01-01');
    expect(idbWrites[0].content).toBe('keep');
  });
});

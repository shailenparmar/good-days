import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Extract and test the scramble logic directly
// These mirror the functions in JournalEditor.tsx

function scrambleChar(char: string): string {
  if (/[a-zA-Z]/.test(char)) {
    const isUpper = char === char.toUpperCase();
    const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    return isUpper ? randomChar.toUpperCase() : randomChar;
  }
  if (/[0-9]/.test(char)) {
    return String(Math.floor(Math.random() * 10));
  }
  return char;
}

function scrambleHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }
  textNodes.forEach(node => {
    const text = node.textContent || '';
    let scrambled = '';
    for (const char of text) {
      scrambled += scrambleChar(char);
    }
    node.textContent = scrambled;
  });
  return div.innerHTML;
}

describe('scrambleChar', () => {
  it('scrambles lowercase letters to lowercase letters', () => {
    for (let i = 0; i < 100; i++) {
      const result = scrambleChar('a');
      expect(result).toMatch(/^[a-z]$/);
    }
  });

  it('scrambles uppercase letters to uppercase letters', () => {
    for (let i = 0; i < 100; i++) {
      const result = scrambleChar('A');
      expect(result).toMatch(/^[A-Z]$/);
    }
  });

  it('scrambles numbers to numbers', () => {
    for (let i = 0; i < 100; i++) {
      const result = scrambleChar('5');
      expect(result).toMatch(/^[0-9]$/);
    }
  });

  it('preserves spaces', () => {
    expect(scrambleChar(' ')).toBe(' ');
  });

  it('preserves punctuation', () => {
    expect(scrambleChar('!')).toBe('!');
    expect(scrambleChar('.')).toBe('.');
    expect(scrambleChar(',')).toBe(',');
    expect(scrambleChar('?')).toBe('?');
  });

  it('preserves special characters', () => {
    expect(scrambleChar('@')).toBe('@');
    expect(scrambleChar('#')).toBe('#');
    expect(scrambleChar('$')).toBe('$');
    expect(scrambleChar('%')).toBe('%');
    expect(scrambleChar('&')).toBe('&');
    expect(scrambleChar('*')).toBe('*');
  });

  it('preserves newlines and tabs', () => {
    expect(scrambleChar('\n')).toBe('\n');
    expect(scrambleChar('\t')).toBe('\t');
  });

  it('preserves unicode/emoji', () => {
    expect(scrambleChar('😀')).toBe('😀');
    expect(scrambleChar('日')).toBe('日');
  });
});

describe('scrambleHtml', () => {
  it('scrambles plain text', () => {
    const result = scrambleHtml('hello');
    expect(result).toHaveLength(5);
    expect(result).toMatch(/^[a-z]{5}$/);
  });

  it('preserves HTML structure', () => {
    const result = scrambleHtml('<div>hello</div>');
    expect(result).toMatch(/^<div>[a-z]{5}<\/div>$/);
  });

  it('handles nested HTML', () => {
    const result = scrambleHtml('<div><span>test</span></div>');
    expect(result).toMatch(/^<div><span>[a-z]{4}<\/span><\/div>$/);
  });

  it('preserves line breaks', () => {
    const result = scrambleHtml('line1<br>line2');
    expect(result).toContain('<br>');
  });

  it('handles empty string', () => {
    expect(scrambleHtml('')).toBe('');
  });

  it('handles whitespace only', () => {
    expect(scrambleHtml('   ')).toBe('   ');
  });

  it('handles mixed content', () => {
    const result = scrambleHtml('Hello 123!');
    // Should have: 5 letters (scrambled) + space + 3 numbers (scrambled) + !
    expect(result).toMatch(/^[A-Za-z][a-z]{4} [0-9]{3}!$/);
  });

  it('preserves character count', () => {
    const input = 'The quick brown fox jumps over the lazy dog 12345';
    const result = scrambleHtml(input);
    expect(result.length).toBe(input.length);
  });

  it('handles multiple text nodes', () => {
    const result = scrambleHtml('<p>first</p><p>second</p>');
    expect(result).toMatch(/^<p>[a-z]{5}<\/p><p>[a-z]{6}<\/p>$/);
  });
});

describe('MutationObserver integration', () => {
  let container: HTMLDivElement;
  let editor: HTMLDivElement;
  let overlay: HTMLDivElement;
  let observer: MutationObserver | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    editor = document.createElement('div');
    editor.contentEditable = 'true';
    overlay = document.createElement('div');
    container.appendChild(editor);
    container.appendChild(overlay);
    document.body.appendChild(container);
  });

  afterEach(() => {
    observer?.disconnect();
    document.body.removeChild(container);
  });

  it('updates overlay when editor content changes', async () => {
    const updateOverlay = vi.fn(() => {
      const content = editor.innerHTML || '';
      overlay.innerHTML = scrambleHtml(content);
    });

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    // Simulate typing
    editor.innerHTML = 'test';

    // MutationObserver callbacks are microtasks
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(updateOverlay).toHaveBeenCalled();
    expect(overlay.innerHTML).toMatch(/^[a-z]{4}$/);
  });

  it('updates overlay on multiple rapid changes', async () => {
    let callCount = 0;
    const updateOverlay = () => {
      callCount++;
      const content = editor.innerHTML || '';
      overlay.innerHTML = scrambleHtml(content);
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    // Simulate rapid typing
    editor.innerHTML = 'a';
    editor.innerHTML = 'ab';
    editor.innerHTML = 'abc';
    editor.innerHTML = 'abcd';
    editor.innerHTML = 'abcde';

    await new Promise(resolve => setTimeout(resolve, 0));

    // Should have been called for changes (may batch)
    expect(callCount).toBeGreaterThan(0);
    expect(overlay.innerHTML).toMatch(/^[a-z]{5}$/);
  });

  it('handles content deletion', async () => {
    editor.innerHTML = 'initial content';

    const updateOverlay = () => {
      const content = editor.innerHTML || '';
      overlay.innerHTML = scrambleHtml(content);
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    // Delete all content
    editor.innerHTML = '';

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(overlay.innerHTML).toBe('');
  });

  it('handles paste (bulk insert)', async () => {
    const updateOverlay = () => {
      const content = editor.innerHTML || '';
      overlay.innerHTML = scrambleHtml(content);
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    // Simulate paste
    editor.innerHTML = 'This is a long pasted text with multiple words and some numbers 12345!';

    await new Promise(resolve => setTimeout(resolve, 0));

    // Should have scrambled content of same length
    const originalLength = 'This is a long pasted text with multiple words and some numbers 12345!'.length;
    expect(overlay.innerHTML.length).toBe(originalLength);
  });
});

describe('Scroll sync', () => {
  let editor: HTMLDivElement;
  let overlay: HTMLDivElement;

  beforeEach(() => {
    editor = document.createElement('div');
    overlay = document.createElement('div');

    // Set up scrollable containers
    editor.style.height = '100px';
    editor.style.overflow = 'auto';
    overlay.style.height = '100px';
    overlay.style.overflow = 'auto';

    // Add lots of content to make it scrollable
    const content = Array(100).fill('Line of content<br>').join('');
    editor.innerHTML = content;
    overlay.innerHTML = content;

    document.body.appendChild(editor);
    document.body.appendChild(overlay);
  });

  afterEach(() => {
    document.body.removeChild(editor);
    document.body.removeChild(overlay);
  });

  it('syncs scroll position from editor to overlay', () => {
    editor.scrollTop = 50;
    overlay.scrollTop = editor.scrollTop;

    expect(overlay.scrollTop).toBe(50);
  });

  it('scroll sync after innerHTML update', () => {
    // Scroll editor
    editor.scrollTop = 100;

    // Simulate what updateOverlay does: set innerHTML then sync scroll
    const content = editor.innerHTML;
    overlay.innerHTML = content;
    overlay.scrollTop = editor.scrollTop;

    expect(overlay.scrollTop).toBe(100);
  });
});

describe('Edge cases', () => {
  it('handles HTML entities', () => {
    const result = scrambleHtml('&lt;hello&gt;');
    // HTML entities are preserved as entities, text inside gets scrambled
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toMatch(/&lt;[a-z]{5}&gt;/);
  });

  it('handles very long content', () => {
    const longText = 'a'.repeat(10000);
    const result = scrambleHtml(longText);
    expect(result.length).toBe(10000);
  });

  it('handles deeply nested HTML', () => {
    const nested = '<div><div><div><div><span>deep</span></div></div></div></div>';
    const result = scrambleHtml(nested);
    expect(result).toContain('<div>');
    expect(result).toContain('<span>');
    expect(result).toMatch(/[a-z]{4}/); // "deep" scrambled
  });

  it('handles content with only HTML tags', () => {
    const result = scrambleHtml('<br><br><br>');
    expect(result).toBe('<br><br><br>');
  });

  it('handles tabs correctly', () => {
    const result = scrambleHtml('a\tb\tc');
    expect(result).toMatch(/^[a-z]\t[a-z]\t[a-z]$/);
  });
});

// Test the placeholder visibility logic (mirrors JournalEditor.tsx)
describe('Placeholder visibility logic', () => {
  interface JournalEntry {
    date: string;
    content: string;
  }

  // This mirrors the logic in JournalEditor.tsx - uses DOM-based text extraction
  function getTextContent(html: string): string {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  function hasActualContent(html: string): boolean {
    return getTextContent(html).trim().length > 0;
  }

  function shouldShowPlaceholder(
    entries: JournalEntry[],
    selectedDate: string,
    isFocused: boolean
  ): boolean {
    const currentEntry = entries.find(e => e.date === selectedDate);
    const hasContent = hasActualContent(currentEntry?.content || '');
    return !hasContent && !isFocused;
  }

  describe('basic visibility', () => {
    it('shows placeholder when entry is empty and not focused', () => {
      const entries = [{ date: '2025-01-28', content: '' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('hides placeholder when entry has content', () => {
      const entries = [{ date: '2025-01-28', content: 'Hello world' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(false);
    });

    it('hides placeholder when focused (even if empty)', () => {
      const entries = [{ date: '2025-01-28', content: '' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', true)).toBe(false);
    });

    it('hides placeholder when entry has content and focused', () => {
      const entries = [{ date: '2025-01-28', content: 'Hello' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', true)).toBe(false);
    });
  });

  describe('whitespace handling', () => {
    it('shows placeholder for whitespace-only content', () => {
      const entries = [{ date: '2025-01-28', content: '   ' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('shows placeholder for newlines-only content', () => {
      const entries = [{ date: '2025-01-28', content: '\n\n\n' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('shows placeholder for tabs-only content', () => {
      const entries = [{ date: '2025-01-28', content: '\t\t' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('hides placeholder for content with leading/trailing whitespace', () => {
      const entries = [{ date: '2025-01-28', content: '  hello  ' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(false);
    });
  });

  describe('entry not found', () => {
    it('shows placeholder when entry does not exist', () => {
      const entries = [{ date: '2025-01-27', content: 'Yesterday' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('shows placeholder with empty entries array', () => {
      const entries: JournalEntry[] = [];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });
  });

  describe('navigation between entries (arrow key simulation)', () => {
    const entries = [
      { date: '2025-01-28', content: 'Today entry' },
      { date: '2025-01-27', content: '' },
      { date: '2025-01-26', content: 'Two days ago' },
      { date: '2025-01-25', content: '   ' },
    ];

    it('hides placeholder when navigating to entry with content', () => {
      // Simulating: user is on 01-27 (empty), navigates to 01-28 (has content)
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(false);
    });

    it('shows placeholder when navigating to empty entry', () => {
      // Simulating: user is on 01-28 (has content), navigates to 01-27 (empty)
      expect(shouldShowPlaceholder(entries, '2025-01-27', false)).toBe(true);
    });

    it('correctly handles rapid navigation through entries', () => {
      // Simulate rapid arrow key presses through all entries
      const results = entries.map(e => shouldShowPlaceholder(entries, e.date, false));

      expect(results[0]).toBe(false); // 01-28: has content
      expect(results[1]).toBe(true);  // 01-27: empty
      expect(results[2]).toBe(false); // 01-26: has content
      expect(results[3]).toBe(true);  // 01-25: whitespace only
    });

    it('never shows placeholder during focus regardless of content', () => {
      // When user clicks into editor, placeholder should never show
      entries.forEach(entry => {
        expect(shouldShowPlaceholder(entries, entry.date, true)).toBe(false);
      });
    });
  });

  describe('HTML content handling', () => {
    it('hides placeholder for HTML with text content', () => {
      const entries = [{ date: '2025-01-28', content: '<div>Hello</div>' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(false);
    });

    // HTML tags are stripped - only actual text matters
    it('shows placeholder for HTML with only <br> tags (no text)', () => {
      const entries = [{ date: '2025-01-28', content: '<br><br>' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('shows placeholder for HTML with only whitespace text', () => {
      const entries = [{ date: '2025-01-28', content: '<div>   </div>' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('shows placeholder for complex empty HTML', () => {
      const entries = [{ date: '2025-01-28', content: '<div><br></div><p></p>' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(true);
    });

    it('hides placeholder for HTML with actual text among tags', () => {
      const entries = [{ date: '2025-01-28', content: '<div><br>Hello<br></div>' }];
      expect(shouldShowPlaceholder(entries, '2025-01-28', false)).toBe(false);
    });
  });

  describe('consistency - no race conditions', () => {
    it('returns same result for same inputs (pure function)', () => {
      const entries = [{ date: '2025-01-28', content: 'Test' }];

      // Call multiple times - should always return same result
      const results = Array(100).fill(null).map(() =>
        shouldShowPlaceholder(entries, '2025-01-28', false)
      );

      expect(new Set(results).size).toBe(1); // All results should be identical
      expect(results[0]).toBe(false);
    });

    it('result only depends on inputs, not timing', () => {
      const entries = [{ date: '2025-01-28', content: '' }];

      // Immediate check
      const result1 = shouldShowPlaceholder(entries, '2025-01-28', false);

      // Check after "delay" (simulated by just calling again)
      const result2 = shouldShowPlaceholder(entries, '2025-01-28', false);

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });
  });
});

// Test the <br> caret fix - ensures consistent caret rendering
describe('Editor <br> caret fix', () => {
  // Simulates the logic used in JournalEditor.tsx for consistent caret
  function ensureCaretBr(innerHTML: string): string {
    if (!innerHTML || innerHTML === '') {
      return '<br>';
    }
    return innerHTML;
  }

  // Simulates content loading logic
  function loadContent(content: string): string {
    const sanitized = content;
    return sanitized || '<br>';
  }

  describe('content loading', () => {
    it('returns <br> for empty string', () => {
      expect(loadContent('')).toBe('<br>');
    });

    it('preserves actual content', () => {
      expect(loadContent('Hello')).toBe('Hello');
    });

    it('preserves HTML content', () => {
      expect(loadContent('<div>Test</div>')).toBe('<div>Test</div>');
    });
  });

  describe('input handling', () => {
    it('adds <br> when innerHTML becomes empty', () => {
      expect(ensureCaretBr('')).toBe('<br>');
    });

    it('preserves content when not empty', () => {
      expect(ensureCaretBr('Hello')).toBe('Hello');
    });

    it('preserves existing <br>', () => {
      expect(ensureCaretBr('<br>')).toBe('<br>');
    });
  });

  describe('interaction with save logic', () => {
    function isContentEmpty(innerHTML: string): boolean {
      const div = document.createElement('div');
      div.innerHTML = innerHTML;
      const textContent = div.textContent || '';
      return textContent.trim().length === 0;
    }

    it('<br> is treated as empty content for saving', () => {
      expect(isContentEmpty('<br>')).toBe(true);
    });

    it('multiple <br> treated as empty', () => {
      expect(isContentEmpty('<br><br><br>')).toBe(true);
    });

    it('actual text is not empty', () => {
      expect(isContentEmpty('Hello')).toBe(false);
    });

    it('<div> with only <br> is empty', () => {
      expect(isContentEmpty('<div><br></div>')).toBe(true);
    });
  });

  describe('caret consistency guarantee', () => {
    function simulateUserFlow(actions: ('type' | 'delete' | 'enter' | 'backspace')[]): string {
      let innerHTML = '<br>';

      for (const action of actions) {
        switch (action) {
          case 'type':
            innerHTML = innerHTML === '<br>' ? 'a' : innerHTML + 'a';
            break;
          case 'delete':
            innerHTML = innerHTML.length > 1 ? innerHTML.slice(0, -1) : '';
            break;
          case 'enter':
            innerHTML = innerHTML === '<br>' ? '<div><br></div>' : innerHTML + '<br>';
            break;
          case 'backspace':
            if (innerHTML === '<div><br></div>') {
              innerHTML = '';
            } else if (innerHTML.endsWith('<br>')) {
              innerHTML = innerHTML.slice(0, -4);
            } else if (innerHTML.length > 0) {
              innerHTML = innerHTML.slice(0, -1);
            }
            break;
        }
        innerHTML = ensureCaretBr(innerHTML);
      }

      return innerHTML;
    }

    it('never returns empty after enter then backspace', () => {
      const result = simulateUserFlow(['enter', 'backspace']);
      expect(result).toBe('<br>');
    });

    it('never returns empty after type then delete all', () => {
      const result = simulateUserFlow(['type', 'delete']);
      expect(result).toBe('<br>');
    });

    it('never returns empty after complex sequence', () => {
      const result = simulateUserFlow([
        'type', 'type', 'enter', 'type', 'backspace', 'backspace', 'delete', 'delete', 'delete'
      ]);
      expect(result).not.toBe('');
    });
  });
});

// Test content normalization (never save <br> as content)
describe('Content normalization', () => {
  function normalizeContent(content: string): string {
    const div = document.createElement('div');
    div.innerHTML = content;
    const textContent = div.textContent || '';
    return textContent.trim() === '' ? '' : content;
  }

  it('normalizes <br> to empty string', () => {
    expect(normalizeContent('<br>')).toBe('');
  });

  it('normalizes multiple <br> to empty string', () => {
    expect(normalizeContent('<br><br><br>')).toBe('');
  });

  it('normalizes <div><br></div> to empty string', () => {
    expect(normalizeContent('<div><br></div>')).toBe('');
  });

  it('normalizes whitespace-only HTML to empty string', () => {
    expect(normalizeContent('<div>   </div>')).toBe('');
  });

  it('preserves actual content', () => {
    expect(normalizeContent('Hello')).toBe('Hello');
  });

  it('preserves HTML with text', () => {
    expect(normalizeContent('<div>Hello</div>')).toBe('<div>Hello</div>');
  });

  it('preserves mixed content', () => {
    expect(normalizeContent('<br>Hello<br>')).toBe('<br>Hello<br>');
  });
});

// Test DOM-based text extraction (robust)
describe('DOM-based text extraction', () => {
  function getTextContent(html: string): string {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  it('extracts text from plain string', () => {
    expect(getTextContent('Hello')).toBe('Hello');
  });

  it('extracts text from HTML', () => {
    expect(getTextContent('<div>Hello</div>')).toBe('Hello');
  });

  it('extracts text from nested HTML', () => {
    expect(getTextContent('<div><span>Hello</span> <b>World</b></div>')).toBe('Hello World');
  });

  it('returns empty for <br>', () => {
    expect(getTextContent('<br>')).toBe('');
  });

  it('returns empty for multiple <br>', () => {
    expect(getTextContent('<br><br><br>')).toBe('');
  });

  it('returns empty for empty div', () => {
    expect(getTextContent('<div></div>')).toBe('');
  });

  it('handles special characters correctly', () => {
    expect(getTextContent('<div>&amp; &lt; &gt;</div>')).toBe('& < >');
  });

  it('handles attributes with > character', () => {
    // This is why we use DOM instead of regex
    expect(getTextContent('<div data-test="a>b">Hello</div>')).toBe('Hello');
  });

  it('handles malformed HTML gracefully', () => {
    // Browser will try to fix malformed HTML
    expect(getTextContent('<div>Hello<span>World</div>')).toContain('Hello');
  });

  it('returns empty for null/undefined', () => {
    expect(getTextContent('')).toBe('');
    expect(getTextContent(null as unknown as string)).toBe('');
  });
});

// Test rAF-based debouncing for fast typing race conditions
describe('requestAnimationFrame debouncing', () => {
  let container: HTMLDivElement;
  let editor: HTMLDivElement;
  let overlay: HTMLDivElement;
  let observer: MutationObserver | null = null;
  let rafId: number | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    editor = document.createElement('div');
    editor.contentEditable = 'true';
    overlay = document.createElement('div');
    container.appendChild(editor);
    container.appendChild(overlay);
    document.body.appendChild(container);

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = setTimeout(() => cb(performance.now()), 16);
      return id as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    observer?.disconnect();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('batches rapid mutations into single update', async () => {
    let updateCount = 0;

    const updateOverlay = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateCount++;
        const content = editor.innerHTML || '';
        overlay.innerHTML = scrambleHtml(content);
        rafId = null;
      });
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Simulate very rapid typing (10 characters in quick succession)
    for (let i = 0; i < 10; i++) {
      editor.innerHTML += 'a';
    }

    // Wait for rAF to fire (mocked at 16ms)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should batch all updates into one (or few) rAF callbacks
    expect(updateCount).toBeLessThanOrEqual(2);
    expect(overlay.innerHTML).toMatch(/^[a-z]{10}$/);
  });

  it('preserves content during rapid typing', async () => {
    const updateOverlay = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        const content = editor.innerHTML || '';
        overlay.innerHTML = scrambleHtml(content);
        rafId = null;
      });
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Type very fast
    const testString = 'quick brown fox';
    for (const char of testString) {
      editor.innerHTML += char;
    }

    // Wait for rAF
    await new Promise(resolve => setTimeout(resolve, 50));

    // Editor should have all characters
    expect(editor.innerHTML).toBe(testString);
    // Overlay should have same length (scrambled)
    expect(overlay.innerHTML.length).toBe(testString.length);
  });

  it('handles interleaved type and delete during fast input', async () => {
    const updateOverlay = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        const content = editor.innerHTML || '';
        overlay.innerHTML = scrambleHtml(content);
        rafId = null;
      });
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Simulate typing with mistakes and corrections
    editor.innerHTML = 'helo';  // typo
    editor.innerHTML = 'hel';   // backspace
    editor.innerHTML = 'hell';  // correct
    editor.innerHTML = 'hello'; // continue

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(editor.innerHTML).toBe('hello');
    expect(overlay.innerHTML.length).toBe(5);
  });

  it('cleans up pending rAF on observer disconnect', async () => {
    let localRafId: number | null = null;
    let rafScheduled = false;

    const updateOverlay = () => {
      if (localRafId !== null) {
        cancelAnimationFrame(localRafId);
      }
      localRafId = requestAnimationFrame(() => {
        overlay.innerHTML = scrambleHtml(editor.innerHTML || '');
        localRafId = null;
      });
      rafScheduled = true;
    };

    observer = new MutationObserver(updateOverlay);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Trigger a mutation
    editor.innerHTML = 'test';

    // Wait for MutationObserver to fire (microtask)
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify rAF was scheduled
    expect(rafScheduled).toBe(true);
    expect(localRafId).not.toBeNull();

    // Now disconnect and cleanup before rAF fires
    observer.disconnect();
    if (localRafId !== null) {
      cancelAnimationFrame(localRafId);
      localRafId = null;
    }

    // localRafId should be cleaned up
    expect(localRafId).toBeNull();
  });
});

// Test ensureBr with rAF debouncing
describe('ensureBr rAF debouncing', () => {
  let editor: HTMLDivElement;
  let observer: MutationObserver | null = null;
  let rafId: number | null = null;

  beforeEach(() => {
    editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.appendChild(editor);

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = setTimeout(() => cb(performance.now()), 16);
      return id as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    observer?.disconnect();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    document.body.removeChild(editor);
    vi.restoreAllMocks();
  });

  it('does not wipe content during rapid typing', async () => {
    const ensureBr = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        if (!editor.innerHTML || editor.innerHTML === '') {
          editor.innerHTML = '<br>';
        }
        rafId = null;
      });
    };

    observer = new MutationObserver(ensureBr);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Simulate rapid typing
    editor.innerHTML = 'a';
    editor.innerHTML = 'ab';
    editor.innerHTML = 'abc';

    await new Promise(resolve => setTimeout(resolve, 50));

    // Content should be preserved, NOT replaced with <br>
    expect(editor.innerHTML).toBe('abc');
  });

  it('adds <br> only when truly empty after settling', async () => {
    const ensureBr = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        if (!editor.innerHTML || editor.innerHTML === '') {
          editor.innerHTML = '<br>';
        }
        rafId = null;
      });
    };

    observer = new MutationObserver(ensureBr);
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Start with content, then delete all
    editor.innerHTML = 'test';
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(editor.innerHTML).toBe('test');

    // Now clear it
    editor.innerHTML = '';
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(editor.innerHTML).toBe('<br>');
  });
});

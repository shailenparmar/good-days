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

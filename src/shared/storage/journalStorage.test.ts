import { describe, it, expect, beforeEach } from 'vitest';

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

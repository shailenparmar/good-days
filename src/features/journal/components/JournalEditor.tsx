import { useRef, useEffect, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import type { JournalEntry } from '../types';

// Sanitize HTML - allow basic formatting tags
const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['br', 'div', 'span', 'p', 'b', 'i', 'u', 'strong', 'em'],
    ALLOWED_ATTR: ['class', 'style'],
  });
};

// Extract text content from HTML using DOM (robust, handles all edge cases)
const getTextContent = (html: string): string => {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};

// Check if HTML has actual text content (not just tags like <br>)
const hasActualContent = (html: string): boolean => {
  return getTextContent(html).trim().length > 0;
};

// Scramble text characters for privacy overlay
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

interface JournalEditorProps {
  entries: JournalEntry[];
  selectedDate: string;
  isScrambled: boolean;
  onInput: (content: string) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
}

export function JournalEditor({
  entries,
  selectedDate,
  isScrambled,
  onInput,
  editorRef,
}: JournalEditorProps) {
  const { getColor, getBgColor } = useTheme();

  // Track focus state for placeholder visibility
  const [isFocused, setIsFocused] = useState(false);

  // Track which date we've loaded to prevent re-loading same content
  const loadedDateRef = useRef<string | null>(null);

  // Ref for scrambled overlay (content managed via MutationObserver, not state)
  const overlayRef = useRef<HTMLDivElement>(null);

  // Placeholder animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = 'start typing';

  // Load content when date changes
  useEffect(() => {
    if (loadedDateRef.current === selectedDate) return;

    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';
    const sanitized = sanitizeHtml(content);

    if (editorRef.current) {
      // Always have at least a <br> for consistent caret rendering
      editorRef.current.innerHTML = sanitized || '<br>';
    }
    loadedDateRef.current = selectedDate;
  }, [entries, selectedDate, editorRef]);

  // MutationObserver to ensure <br> exists for consistent caret rendering
  // This catches ALL changes: typing, paste, cut, undo, select-all+delete, etc.
  useEffect(() => {
    if (!editorRef.current) return;

    let rafId: number | null = null;

    const ensureBr = () => {
      // Cancel any pending check to avoid race conditions during fast typing
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Batch using requestAnimationFrame to avoid mid-keystroke checks
      rafId = requestAnimationFrame(() => {
        if (!editorRef.current) return;
        // If editor is completely empty, add <br> for consistent caret
        if (!editorRef.current.innerHTML || editorRef.current.innerHTML === '') {
          editorRef.current.innerHTML = '<br>';
        }
        rafId = null;
      });
    };

    const observer = new MutationObserver(ensureBr);
    observer.observe(editorRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [editorRef]);

  // MutationObserver to sync scrambled overlay with editor content
  // This handles ALL changes: typing, paste, cut, undo, tab, date changes, etc.
  useEffect(() => {
    if (!isScrambled || !editorRef.current) return;

    let rafId: number | null = null;

    const updateOverlay = () => {
      // Cancel any pending update to avoid race conditions during fast typing
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Batch updates using requestAnimationFrame
      rafId = requestAnimationFrame(() => {
        if (!overlayRef.current || !editorRef.current) return;
        const content = editorRef.current.innerHTML || '';
        overlayRef.current.innerHTML = sanitizeHtml(scrambleHtml(content));
        // Sync scroll AFTER setting content (innerHTML can reset scrollTop)
        overlayRef.current.scrollTop = editorRef.current.scrollTop;
        rafId = null;
      });
    };

    // Initial sync when scramble mode turns on
    updateOverlay();

    // Watch for ANY DOM changes in the editor
    const observer = new MutationObserver(updateOverlay);
    observer.observe(editorRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isScrambled, editorRef]);

  // Sync scroll position during user scrolling
  const handleEditorScroll = useCallback(() => {
    if (overlayRef.current && editorRef.current) {
      overlayRef.current.scrollTop = editorRef.current.scrollTop;
    }
  }, [editorRef]);

  // Handle user input (scrambled overlay is updated via MutationObserver)
  // Note: <br> maintenance is handled by the MutationObserver above
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    // Check for \time and replace with timestamp
    const textContent = editorRef.current.textContent || '';
    if (textContent.includes('\\time')) {
      const now = new Date();
      const use24Hour = getItem('timeFormat') === '24h';
      const timestamp = now.toLocaleTimeString('en-US', {
        hour12: !use24Hour,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });

      // Replace \time in the HTML content
      const selection = window.getSelection();
      const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;

      editorRef.current.innerHTML = editorRef.current.innerHTML.replace(/\\time/g, `[${timestamp}]`);

      // Restore cursor to end
      if (savedRange && selection) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    const content = editorRef.current.innerHTML || '';
    onInput(content);
  }, [editorRef, onInput]);

  // Clean up empty timestamps on blur (not during typing)
  const handleBlur = useCallback(() => {
    setIsFocused(false);

    if (!editorRef.current) return;

    const timestamps = editorRef.current.querySelectorAll('.timestamp-separator');
    timestamps.forEach((timestamp, index) => {
      if (index !== timestamps.length - 1) return;

      const timestampNode = timestamp as HTMLElement;
      let hasContentAfter = false;
      let node = timestampNode.nextSibling;

      while (node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          hasContentAfter = true;
          break;
        }
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).textContent?.trim()) {
          hasContentAfter = true;
          break;
        }
        node = node.nextSibling;
      }

      if (!hasContentAfter) {
        let prev = timestampNode.previousSibling;
        let next = timestampNode.nextSibling;

        while (prev && (prev.nodeName === 'BR' || (prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()))) {
          const toRemove = prev;
          prev = prev.previousSibling;
          toRemove.remove();
        }

        while (next && (next.nodeName === 'BR' || (next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()))) {
          const toRemove = next;
          next = next.nextSibling;
          toRemove.remove();
        }

        timestampNode.remove();
      }
    });
  }, [editorRef]);

  // Handle Tab key to insert/remove tab character
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: remove tab before cursor if present
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (range.startOffset > 0 && range.startContainer.nodeType === Node.TEXT_NODE) {
            const text = range.startContainer.textContent || '';
            const charBefore = text[range.startOffset - 1];
            if (charBefore === '\t') {
              // Select the tab character, then replace with empty string
              // Using execCommand keeps caret behavior consistent with Tab insert
              selection.modify('extend', 'backward', 'character');
              document.execCommand('insertText', false, '');
            }
          }
        }
      } else {
        // Tab: insert tab character
        document.execCommand('insertText', false, '\t');
      }
    }
  }, []);

  // Focus the editor
  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, [editorRef]);

  // Placeholder - derived from actual data using DOM-based text extraction
  // This correctly handles <br>, <div><br></div>, and all HTML edge cases
  const currentEntry = entries.find(e => e.date === selectedDate);
  const hasContent = hasActualContent(currentEntry?.content || '');
  const showPlaceholder = !hasContent && !isFocused;

  useEffect(() => {
    if (!showPlaceholder) return;

    const nextCount = boldCount + 1;
    const maxCount = placeholderText.length;

    if (boldCount >= maxCount) {
      setAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setBoldCount(nextCount), 83);
    return () => clearTimeout(timer);
  }, [showPlaceholder, boldCount, animPhase]);

  // Reset animation when placeholder appears
  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder]);

  return (
    <div
      className="flex-1 relative cursor-text"
      style={{ backgroundColor: getBgColor() }}
      onClick={handleContainerClick}
    >
      <style>
        {`
          .dynamic-editor {
            caret-color: ${getColor()};
          }
          .timestamp-line {
            background: repeating-linear-gradient(
              to right,
              ${getColor().replace('hsl', 'hsla').replace(')', ', 0.5)')} 0px,
              ${getColor().replace('hsl', 'hsla').replace(')', ', 0.5)')} 8px,
              transparent 8px,
              transparent 12px
            ) !important;
          }
          .timestamp-text {
            color: ${getColor().replace('hsl', 'hsla').replace(')', ', 0.65)')} !important;
          }
        `}
      </style>

      {/* Editor - absolutely positioned to fill container */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onScroll={handleEditorScroll}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className="absolute inset-0 p-8 overflow-y-auto scrollbar-hide focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor"
        style={{ color: isScrambled ? 'transparent' : getColor() }}
        spellCheck={false}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Journal entry content"
        aria-multiline="true"
      />

      {/* Scrambled overlay - content managed via MutationObserver */}
      {isScrambled && (
        <div
          ref={overlayRef}
          className="absolute inset-0 p-8 overflow-y-auto scrollbar-hide text-base leading-relaxed font-mono font-bold whitespace-pre-wrap pointer-events-none"
          style={{ color: getColor() }}
        />
      )}

      {/* Placeholder */}
      {showPlaceholder && (
        <div
          className="absolute top-8 left-8 text-base leading-relaxed font-mono pointer-events-none select-none"
          style={{ color: getColor(), opacity: 0.9 }}
        >
          {animPhase === 'bold' ? (
            <>
              <span className="font-bold">{placeholderText.slice(0, boldCount)}</span>
              <span>{placeholderText.slice(boldCount)}</span>
            </>
          ) : (
            <>
              <span>{placeholderText.slice(0, boldCount)}</span>
              <span className="font-bold">{placeholderText.slice(boldCount)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useRef, useEffect, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import { useKeyedPersisted } from '@shared/hooks';
import { getTodayDate } from '@shared/utils/date';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { JournalEntry } from '../types';

// Sanitize HTML - allow basic formatting tags, strip all attributes
const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['br', 'div', 'span', 'p', 'b', 'i', 'u', 'strong', 'em'],
    ALLOWED_ATTR: [],
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
  onClick?: () => void;
}

export function JournalEditor({
  entries,
  selectedDate,
  isScrambled,
  onInput,
  editorRef,
  onClick,
}: JournalEditorProps) {
  const { getColor, getBgColor } = useTheme();

  // Track focus state for placeholder visibility
  const [isFocused, setIsFocused] = useState(false);

  // Track which date we've loaded to prevent re-loading same content
  const loadedDateRef = useRef<string | null>(null);

  // Ref for scrambled overlay (content managed via MutationObserver, not state)
  const overlayRef = useRef<HTMLDivElement>(null);

  // Scroll position persistence
  const scrollPosition = useKeyedPersisted<number>('scrollPosition', 0);
  const scrollSaveTimeout = useRef<number | null>(null);

  // Flag to prevent re-entry during whitespace wrap
  const isWrappingRef = useRef(false);

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

      // Restore scroll position after content loads
      const savedScrollTop = scrollPosition.get(selectedDate);
      if (savedScrollTop > 0) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.scrollTop = savedScrollTop;
          }
        });
      }
    }
    loadedDateRef.current = selectedDate;
  }, [entries, selectedDate, editorRef, scrollPosition]);

  // Ensure <br> exists for consistent block caret rendering when editor is empty
  // Only check on blur, not during typing (MutationObserver during typing causes bugs)
  const ensureBrIfEmpty = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Only reset to <br> if truly empty - no text content AND no br tag
    if (!html || html === '' || (html === '<div></div>' || html === '<p></p>')) {
      editorRef.current.innerHTML = '<br>';
    }
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
        // Sync scroll position via transform (overlay uses overflow:hidden)
        overlayRef.current.style.transform = `translateY(-${editorRef.current.scrollTop}px)`;
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

  // Check if content has overflowed and wrap if needed
  // Uses scrollLeft > 0 as indicator that browser tried to scroll to show cursor
  const wrapIfOverflowing = useCallback(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;

    // If browser tried to scroll right (scrollLeft > 0), content has overflowed
    // Insert line break and reset scroll
    if (editor.scrollLeft > 0 && !isWrappingRef.current) {
      isWrappingRef.current = true;
      document.execCommand('insertLineBreak');
      editor.scrollLeft = 0;
      setTimeout(() => { isWrappingRef.current = false; }, 10);
    }
  }, [editorRef]);

  // Sync scroll position during user scrolling and persist to storage
  const handleEditorScroll = useCallback(() => {
    if (!editorRef.current) return;

    // If horizontal scroll detected and not already wrapping, wrap whitespace and reset
    if (editorRef.current.scrollLeft > 0 && !isWrappingRef.current) {
      isWrappingRef.current = true;
      document.execCommand('insertLineBreak');
      editorRef.current.scrollLeft = 0;
      // Reset flag after a short delay to allow DOM to settle
      setTimeout(() => { isWrappingRef.current = false; }, 10);
    }

    // Sync scrambled overlay position via transform (overlay uses overflow:hidden)
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translateY(-${editorRef.current.scrollTop}px)`;
    }

    // Debounce scroll position save (100ms)
    if (scrollSaveTimeout.current !== null) {
      clearTimeout(scrollSaveTimeout.current);
    }
    scrollSaveTimeout.current = window.setTimeout(() => {
      if (editorRef.current) {
        scrollPosition.set(selectedDate, editorRef.current.scrollTop);
      }
      scrollSaveTimeout.current = null;
    }, 100);
  }, [editorRef, selectedDate, scrollPosition]);

  // Handle user input (scrambled overlay is updated via MutationObserver)
  // Note: <br> maintenance is handled by the MutationObserver above
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    // Track typing while scrambled
    if (isScrambled) {
      markEasterEggFound('scrambleTyping');
    }

    // Check for \time or \TIME and replace with timestamp
    const textContent = editorRef.current.textContent || '';
    if (textContent.toLowerCase().includes('\\time')) {
      const now = new Date();
      const use24Hour = getItem('timeFormat') === '24h';
      const timestamp = now.toLocaleTimeString('en-US', {
        hour12: !use24Hour,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });

      // Find where \time is in the text, so we can position cursor after replacement
      const timeIndex = textContent.toLowerCase().indexOf('\\time');
      const timestampText = `[${timestamp}]`;
      const cursorTargetOffset = timeIndex + timestampText.length;

      // Replace only the FIRST \time occurrence (matches our cursor calculation)
      editorRef.current.innerHTML = editorRef.current.innerHTML.replace(/\\time/i, timestampText);
      markEasterEggFound('timeCommand');

      // Position cursor right after the inserted timestamp
      const selection = window.getSelection();
      if (selection) {
        // Walk through text nodes to find the correct cursor position
        let currentOffset = 0;
        let cursorSet = false;
        const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          const nodeLength = node.textContent?.length || 0;
          if (currentOffset + nodeLength >= cursorTargetOffset) {
            const range = document.createRange();
            range.setStart(node, cursorTargetOffset - currentOffset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            cursorSet = true;
            break;
          }
          currentOffset += nodeLength;
        }
        // Fallback: if no text node found at target offset, put cursor at end
        if (!cursorSet) {
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }

    const content = editorRef.current.innerHTML || '';
    onInput(content);

    // Note: horizontal scroll/wrap is handled by wrapIfOverflowing for whitespace

    // Ensure block caret if content was deleted to empty
    if (!content || content === '' || content === '<br>') {
      ensureBrIfEmpty();
    }
  }, [editorRef, onInput, isScrambled, ensureBrIfEmpty]);

  // Clean up empty timestamps on blur (not during typing)
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    ensureBrIfEmpty(); // Ensure block caret on next focus

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
  }, [editorRef, ensureBrIfEmpty]);

  // Handle Tab and Backspace/Delete keys
  // Using execCommand('insertText', '') keeps caret solid (no blink)
  // Native deletion causes caret to blink; insertText treats it as input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey) {
        // Tab: insert 4 spaces (tab characters cause browser tab-stop issues)
        document.execCommand('insertText', false, '    ');
      }
      // Shift+Tab: do nothing (just prevent default)
    } else if (e.key === ' ') {
      // Space: let browser handle insertion, then check if we need to wrap
      requestAnimationFrame(() => {
        wrapIfOverflowing();
      });
    } else if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      // If text is selected, handle with execCommand to keep cursor solid
      if (!selection.isCollapsed) {
        e.preventDefault();
        document.execCommand('insertText', false, '');
        return;
      }

      // Check if we're in a text node with content before cursor - use custom handling
      if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
        e.preventDefault();
        // Determine granularity based on modifier keys
        // ⌘+Backspace = delete to line start, ⌥+Backspace = delete word
        const granularity = e.metaKey ? 'lineboundary' : e.altKey ? 'word' : 'character';
        selection.modify('extend', 'backward', granularity);
        document.execCommand('insertText', false, '');
        return;
      }

      // For line breaks and structural elements (div, br), let browser handle natively
      // This ensures correct behavior with Enter-created line breaks
    } else if (e.key === 'Delete') {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      // If text is selected, handle with execCommand to keep cursor solid
      if (!selection.isCollapsed) {
        e.preventDefault();
        document.execCommand('insertText', false, '');
        return;
      }

      // Check if we're in a text node with content after cursor - use custom handling
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer as Text;
        if (range.startOffset < textNode.length) {
          e.preventDefault();
          // Determine granularity based on modifier keys
          // ⌥+Delete = delete word forward
          const granularity = e.altKey ? 'word' : 'character';
          selection.modify('extend', 'forward', granularity);
          document.execCommand('insertText', false, '');
          return;
        }
      }

      // For line breaks and structural elements (div, br), let browser handle natively
    }
  }, [editorRef, wrapIfOverflowing]);

  // Focus the editor and notify parent
  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
    onClick?.();
  }, [editorRef, onClick]);

  // Check if this is today's entry (the only editable entry)
  const isToday = selectedDate === getTodayDate();

  // Placeholder - derived from actual data using DOM-based text extraction
  // This correctly handles <br>, <div><br></div>, and all HTML edge cases
  const currentEntry = entries.find(e => e.date === selectedDate);
  const hasContent = hasActualContent(currentEntry?.content || '');
  // Only show placeholder for today's entry when empty and not focused
  const showPlaceholder = isToday && !hasContent && !isFocused;

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
      {/* Only today's entry is editable; past entries are read-only */}
      <div
        ref={editorRef}
        contentEditable={isToday}
        onInput={isToday ? handleInput : undefined}
        onScroll={handleEditorScroll}
        onKeyDown={isToday ? handleKeyDown : undefined}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className="absolute inset-0 p-8 overflow-y-auto overflow-x-auto scrollbar-hide focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor"
        style={{ color: isScrambled ? 'transparent' : getColor(), overflowWrap: 'anywhere', wordBreak: 'break-all' }}
        spellCheck={false}
        suppressContentEditableWarning
        role={isToday ? 'textbox' : 'article'}
        aria-label={isToday ? 'Journal entry content' : 'Journal entry (read-only)'}
        aria-multiline="true"
        aria-readonly={!isToday}
      />

      {/* Scrambled overlay - mirrors editor content with scrambled text */}
      {/* Outer container clips overflow; inner content flows naturally and shifts via transform */}
      {isScrambled && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            ref={overlayRef}
            className="w-full p-8 text-base leading-relaxed font-mono font-bold whitespace-pre-wrap break-all"
            style={{ color: getColor() }}
          />
        </div>
      )}

      {/* Placeholder */}
      {showPlaceholder && (
        <div
          className="absolute top-8 left-8 text-base leading-relaxed font-mono pointer-events-none select-none"
          style={{ color: getColor(), opacity: 0.85 }}
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

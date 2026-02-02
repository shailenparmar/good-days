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

  // Calculate width of spaces using canvas (cached)
  const spaceWidthRef = useRef<number | null>(null);
  const getSpaceWidth = useCallback(() => {
    if (spaceWidthRef.current !== null) return spaceWidthRef.current;
    if (!editorRef.current) return 10; // fallback

    const style = window.getComputedStyle(editorRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 10;

    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    spaceWidthRef.current = ctx.measureText(' ').width;
    return spaceWidthRef.current;
  }, [editorRef]);

  // Check if adding spaces would overflow, and if so, wrap first
  // Returns true if we handled it (caller should preventDefault)
  const wrapBeforeSpaces = useCallback((numSpaces: number): boolean => {
    if (!editorRef.current) return false;

    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // If rect has no position (empty line), no need to wrap
    if (rect.left === 0 && rect.right === 0) return false;

    const editorRect = editor.getBoundingClientRect();
    const rightEdge = editorRect.right - 32; // 32px padding
    const spaceWidth = getSpaceWidth();
    const neededWidth = spaceWidth * numSpaces;

    // If cursor + spaces would overflow, wrap first
    if (rect.right + neededWidth >= rightEdge) {
      document.execCommand('insertLineBreak');

      // Scroll into view if needed
      const newRect = selection.getRangeAt(0).getBoundingClientRect();
      if (newRect.bottom > editorRect.bottom) {
        editor.scrollTop += newRect.bottom - editorRect.bottom + 20;
      }
      return true; // We handled wrapping, but caller still needs to insert spaces
    }

    return false;
  }, [editorRef, getSpaceWidth]);

  // Sync scroll position during user scrolling and persist to storage
  const handleEditorScroll = useCallback(() => {
    if (!editorRef.current) return;

    // Reset any accidental horizontal scroll (shouldn't happen with proactive wrapping)
    if (editorRef.current.scrollLeft > 0) {
      editorRef.current.scrollLeft = 0;
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

    // Note: whitespace wrapping is handled proactively by wrapBeforeSpaces

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
        // Tab: check if would overflow, wrap first if needed, then insert 4 spaces
        wrapBeforeSpaces(4);
        document.execCommand('insertText', false, '    ');
      }
      // Shift+Tab: do nothing (just prevent default)
    } else if (e.key === ' ') {
      // Space: check if would overflow, wrap first if needed
      if (wrapBeforeSpaces(1)) {
        // We wrapped, now insert the space
        e.preventDefault();
        document.execCommand('insertText', false, ' ');
      }
      // else let browser handle normally
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

      // At start of line (offset 0) - use selection.modify to delete backward
      // This handles line breaks created by tab wrapping or Enter
      if (range.startOffset === 0) {
        e.preventDefault();
        selection.modify('extend', 'backward', 'character');
        document.execCommand('insertText', false, '');
        return;
      }

      // Check if we're in a text node with content before cursor - use custom handling
      if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
        e.preventDefault();

        // Smart Tab deletion: if 4 spaces before cursor, delete all 4
        if (!e.metaKey && !e.altKey && range.startOffset >= 4) {
          const text = range.startContainer.textContent || '';
          const beforeCursor = text.substring(range.startOffset - 4, range.startOffset);
          if (beforeCursor === '    ') {
            // Delete all 4 spaces
            for (let i = 0; i < 4; i++) {
              selection.modify('extend', 'backward', 'character');
            }
            document.execCommand('insertText', false, '');
            return;
          }
        }

        // Determine granularity based on modifier keys
        // ⌘+Backspace = delete to line start, ⌥+Backspace = delete word
        const granularity = e.metaKey ? 'lineboundary' : e.altKey ? 'word' : 'character';
        selection.modify('extend', 'backward', granularity);
        document.execCommand('insertText', false, '');
        return;
      }

      // For other structural elements, let browser handle natively
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
  }, [editorRef, wrapBeforeSpaces]);

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
        style={{ color: isScrambled ? 'transparent' : getColor(), overflowWrap: 'break-word' }}
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
            className="w-full p-8 text-base leading-relaxed font-mono font-bold whitespace-pre-wrap"
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

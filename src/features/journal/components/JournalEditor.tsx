import { useRef, useEffect, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from '@features/theme';
import type { JournalEntry } from '../types';

// Sanitize HTML - allow basic formatting tags
const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['br', 'div', 'span', 'p', 'b', 'i', 'u', 'strong', 'em'],
    ALLOWED_ATTR: ['class', 'style'],
  });
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
  // Track if initial content has loaded (to prevent placeholder flash)
  const [contentLoaded, setContentLoaded] = useState(false);

  // Scrambled content for overlay (only computed when scrambled)
  const [scrambledHtml, setScrambledHtml] = useState('');
  // Track if scramble overlay is ready (to prevent flash of unscrambled content)
  const [scrambleReady, setScrambleReady] = useState(!isScrambled);

  // Placeholder animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = 'type here';

  // Check if editor is empty - read directly from DOM
  const isEditorEmpty = useCallback((): boolean => {
    if (!editorRef.current) return true;
    const text = editorRef.current.textContent || '';
    return text.trim().length === 0;
  }, [editorRef]);

  // Load content when date changes
  useEffect(() => {
    if (loadedDateRef.current === selectedDate) return;

    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';
    const sanitized = sanitizeHtml(content);

    if (editorRef.current) {
      editorRef.current.innerHTML = sanitized;
    }
    loadedDateRef.current = selectedDate;

    // Update scrambled overlay if needed
    if (isScrambled && sanitized) {
      setScrambledHtml(scrambleHtml(sanitized));
      setScrambleReady(true);
    } else {
      setScrambledHtml('');
      setScrambleReady(true);
    }

    // Mark content as loaded after paint (prevents placeholder flash)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setContentLoaded(true);
      });
    });
  }, [entries, selectedDate, editorRef, isScrambled]);

  // Update scrambled content when scramble mode changes or content changes
  const updateScrambledContent = useCallback(() => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML || '';
    if (isScrambled && content) {
      setScrambledHtml(scrambleHtml(content));
      setScrambleReady(true);
    } else {
      setScrambledHtml('');
      setScrambleReady(true);
    }
  }, [editorRef, isScrambled]);

  // When scramble mode toggles, update the overlay
  useEffect(() => {
    updateScrambledContent();
  }, [isScrambled, updateScrambledContent]);

  // Handle user input
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML || '';
    onInput(content);

    // Update scrambled overlay
    if (isScrambled && content) {
      setScrambledHtml(scrambleHtml(content));
    }
  }, [editorRef, onInput, isScrambled]);

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

  // Focus the editor
  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, [editorRef]);

  // Placeholder animation - only show after content has loaded to prevent flash
  const showPlaceholder = contentLoaded && isEditorEmpty() && !isFocused;

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

      {/* Scrambled overlay */}
      {isScrambled && scrambledHtml && (
        <div
          className="absolute inset-0 p-8 overflow-y-auto scrollbar-hide text-base leading-relaxed font-mono font-bold whitespace-pre-wrap pointer-events-none"
          style={{ color: getColor() }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(scrambledHtml) }}
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

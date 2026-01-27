import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from '@features/theme';
import type { JournalEntry } from '../types';

// Configure DOMPurify to allow safe HTML elements for the editor
const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['br', 'div', 'span', 'p', 'b', 'i', 'u', 'strong', 'em'],
    ALLOWED_ATTR: ['class', 'style'],
  });
};

interface JournalEditorProps {
  entries: JournalEntry[];
  selectedDate: string;
  currentContent: string;
  isScrambled: boolean;
  onInput: (content: string) => void;
  onSave: (content: string, timestamp?: number) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
  unscrambledContentRef?: React.MutableRefObject<string>;
}

// Scramble a single character - letters and digits get randomized, everything else stays
function scrambleChar(char: string): string {
  if (/[a-zA-Z]/.test(char)) {
    const isUpper = char === char.toUpperCase();
    const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    return isUpper ? randomChar.toUpperCase() : randomChar;
  }
  if (/[0-9]/.test(char)) {
    return String(Math.floor(Math.random() * 10));
  }
  return char; // spaces, punctuation, etc. stay as-is
}

// Scramble all text in HTML - fresh random for each alphanumeric character
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

export function JournalEditor({
  entries,
  selectedDate,
  isScrambled,
  onInput,
  editorRef,
}: JournalEditorProps) {
  const { getColor, getBgColor } = useTheme();

  // Single source of truth: editor content as state
  const [editorContent, setEditorContent] = useState<string>('');

  // Scramble content - only recalculates when editorContent changes (not on every render)
  const [scrambledContent, setScrambledContent] = useState('');

  useEffect(() => {
    if (isScrambled && editorContent) {
      setScrambledContent(scrambleHtml(editorContent));
    } else {
      setScrambledContent('');
    }
  }, [editorContent, isScrambled]);

  // Placeholder animation state
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const [isFocused, setIsFocused] = useState(false);
  const placeholderText = 'type here';

  // Derived: isEmpty from editorContent
  const isEmpty = useMemo(() => {
    if (!editorContent) return true;
    const div = document.createElement('div');
    div.innerHTML = editorContent;
    return (div.textContent || '').trim().length === 0;
  }, [editorContent]);

  const showPlaceholder = isEmpty && !isFocused;

  // Handle bold/unbold animation at 12fps
  useEffect(() => {
    if (!showPlaceholder) return;

    if (animPhase === 'bold') {
      if (boldCount >= placeholderText.length) {
        setAnimPhase('unbold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setBoldCount(c => c + 1);
      }, 83);
      return () => clearTimeout(timer);
    }

    if (animPhase === 'unbold') {
      if (boldCount >= placeholderText.length) {
        setAnimPhase('bold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setBoldCount(c => c + 1);
      }, 83);
      return () => clearTimeout(timer);
    }
  }, [showPlaceholder, boldCount, animPhase]);

  // Reset animation when placeholder becomes visible
  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder]);

  // Load content when date changes or when entries first load
  const loadedDateRef = useRef<string>('');
  const hasLoadedContentRef = useRef<boolean>(false);

  useEffect(() => {
    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';

    // Load when:
    // 1. Date changes, OR
    // 2. We haven't loaded real content yet and entries just populated
    const dateChanged = loadedDateRef.current !== selectedDate;
    const needsInitialLoad = !hasLoadedContentRef.current && entries.length > 0;

    if (dateChanged || needsInitialLoad) {
      loadedDateRef.current = selectedDate;
      hasLoadedContentRef.current = entries.length > 0;
      const sanitizedContent = sanitizeHtml(content);
      setEditorContent(sanitizedContent);
      if (editorRef.current) {
        editorRef.current.innerHTML = sanitizedContent;
      }
    }
  }, [entries, selectedDate, editorRef]);

  // Keep DOM in sync with state when state is the source of truth (e.g., initial load)
  // This ensures clicking in scrambled mode works correctly
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== editorContent) {
      // Only sync if user isn't actively focused (typing)
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = editorContent;
      }
    }
  }, [editorContent, editorRef]);


  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    // Clean up empty timestamps (only when not scrambled to avoid DOM manipulation issues)
    if (!isScrambled) {
      const timestamps = editorRef.current.querySelectorAll('.timestamp-separator');
      timestamps.forEach((timestamp, index) => {
        const isLastTimestamp = index === timestamps.length - 1;
        if (isLastTimestamp) {
          const timestampNode = timestamp as HTMLElement;
          const parent = timestampNode.parentElement;
          if (parent) {
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
          }
        }
      });
    }

    // Update state - this is the single source of truth
    const content = editorRef.current.innerHTML || '';
    setEditorContent(content);
    onInput(content);
  }, [editorRef, onInput, isScrambled]);

  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, [editorRef]);

  return (
    <div
      className="flex-1 p-8 relative overflow-y-auto scrollbar-hide cursor-text"
      style={{ backgroundColor: getBgColor() }}
      onClick={handleContainerClick}
    >
      <style>
        {`
          .dynamic-editor {
            caret-color: ${getColor()};
          }
          .dynamic-editor-visible {
            color: ${getColor()};
          }
          .dynamic-editor-hidden {
            color: transparent !important;
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
      <div className="relative w-full h-full overflow-y-auto scrollbar-hide" style={{ minHeight: '100%' }}>
        {/* Container for both layers - they share the same content height and scroll together */}
        <div className="relative" style={{ minHeight: '100%' }}>
          {/* Original editor - always rendered, text invisible when scrambled but cursor visible */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onClick={() => editorRef.current?.focus()}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`w-full focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor ${isScrambled ? 'dynamic-editor-hidden' : 'dynamic-editor-visible'}`}
            style={{ minHeight: '100%', height: '100%' }}
            spellCheck="false"
            suppressContentEditableWarning
            role="textbox"
            aria-label="Journal entry content"
            aria-multiline="true"
          />

          {/* Scrambled overlay - positioned over editor, scrolls with it */}
          {isScrambled && scrambledContent && (
            <div
              className="absolute top-0 left-0 w-full focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor dynamic-editor-visible"
              style={{
                pointerEvents: 'none',
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(scrambledContent) }}
            />
          )}
          {showPlaceholder && (
            <div
              className="absolute top-0 left-0 text-base leading-relaxed font-mono pointer-events-none select-none"
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
      </div>
    </div>
  );
}

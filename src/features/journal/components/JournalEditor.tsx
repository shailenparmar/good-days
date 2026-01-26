import { useRef, useEffect, useCallback, useState } from 'react';
import { useTheme } from '@features/theme';
import { scrambleChar } from '@shared/utils/scramble';
import type { JournalEntry } from '../types';

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

// Helper: Convert plain text to HTML (newlines become <br>)
function textToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Helper: Convert HTML to plain text
function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return div.textContent || '';
}

// Helper: Scramble text (letters -> random letters, digits -> random digits)
function scrambleText(text: string): string {
  return text.split('').map(c =>
    /[a-zA-Z0-9]/.test(c) ? scrambleChar(c) : c
  ).join('');
}

// Helper: Scramble HTML by walking text nodes and scrambling their content
function scrambleHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Walk all text nodes and scramble them
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  textNodes.forEach(node => {
    node.textContent = scrambleText(node.textContent || '');
  });

  return div.innerHTML;
}

export function JournalEditor({
  entries,
  selectedDate,
  isScrambled,
  onInput,
  editorRef,
  unscrambledContentRef,
}: JournalEditorProps) {
  const { getColor, getBgColor, hue, saturation, lightness } = useTheme();

  // Refs for normal editing
  const lastContentLength = useRef<number>(0);
  const hasLoadedInitialContent = useRef<boolean>(false);
  const isCurrentlyTyping = useRef<boolean>(false);

  // State for scramble mode
  const [scrambledDisplay, setScrambledDisplay] = useState<string>('');

  // Placeholder animation state
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const [isEmpty, setIsEmpty] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const placeholderText = 'type here';

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

  // Reset animation when switching to empty entry
  useEffect(() => {
    const entry = entries.find(e => e.date === selectedDate);
    // Check actual text content, not HTML
    if (entry?.content) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = entry.content;
      const hasContent = (tempDiv.textContent || '').trim().length > 0;
      setIsEmpty(!hasContent);
    } else {
      setIsEmpty(true);
    }
  }, [entries, selectedDate]);

  // Reset animation when placeholder becomes visible
  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder]);

  // Handle scramble mode transitions
  useEffect(() => {
    if (!editorRef.current) return;

    if (isScrambled) {
      // ENTERING scramble mode - just show scrambled overlay
      setScrambledDisplay(scrambleHtml(editorRef.current.innerHTML || ''));
    } else {
      // EXITING scramble mode - just hide overlay
      setScrambledDisplay('');
    }
  }, [isScrambled, editorRef, unscrambledContentRef]);


  // Populate editor when selectedDate changes or on initial load
  useEffect(() => {
    if (!editorRef.current) return;

    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';

    if (isCurrentlyTyping.current) {
      return;
    }

    const isTyping = document.activeElement === editorRef.current;
    const shouldUpdate = !isTyping || !hasLoadedInitialContent.current;

    if (shouldUpdate) {
      editorRef.current.innerHTML = content;
      lastContentLength.current = editorRef.current.textContent?.length || 0;
      hasLoadedInitialContent.current = true;
    }
  }, [entries, selectedDate, editorRef]);

  // Reset loaded content flag when date changes
  useEffect(() => {
    hasLoadedInitialContent.current = false;
  }, [selectedDate]);


  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    isCurrentlyTyping.current = true;

    // When scrambled, update the scrambled display
    if (isScrambled) {
      setScrambledDisplay(scrambleHtml(editorRef.current.innerHTML || ''));
      onInput(editorRef.current.innerHTML || '');
      return;
    }

    // Remove timestamps that have no content after them
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

    lastContentLength.current = editorRef.current.textContent?.length || 0;
    onInput(editorRef.current.innerHTML || '');

    // Update isEmpty state for placeholder animation
    const editorText = editorRef.current.textContent || '';
    const nowEmpty = editorText.trim().length === 0;
    if (nowEmpty !== isEmpty) {
      setIsEmpty(nowEmpty);
      if (nowEmpty) {
        setBoldCount(0);
        setAnimPhase('bold');
      }
    }

    setTimeout(() => {
      isCurrentlyTyping.current = false;
    }, 100);
  }, [editorRef, onInput, isEmpty, isScrambled]);

  return (
    <div className="flex-1 p-8 relative overflow-y-auto scrollbar-hide" style={{ backgroundColor: getBgColor() }}>
      <style>
        {`
          .dynamic-editor {
            caret-color: ${getColor()};
            color: ${getColor()};
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
      <div className="relative w-full h-full">
        {/* Original editor - always rendered, text invisible when scrambled but cursor visible */}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full h-full focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor"
          style={{
            color: isScrambled ? 'transparent' : undefined,
            caretColor: getColor(),
          }}
          spellCheck="false"
          suppressContentEditableWarning
        />

        {/* Scrambled overlay - shows scrambled text on top, no pointer events */}
        {isScrambled && (
          <div
            className="absolute top-0 left-0 w-full h-full focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor"
            style={{
              pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: scrambledDisplay }}
          />
        )}
        {showPlaceholder && (
          <div
            className="absolute top-0 left-0 text-base leading-relaxed font-mono pointer-events-none"
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
  );
}

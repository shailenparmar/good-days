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

export function JournalEditor({
  entries,
  selectedDate,
  isScrambled,
  onInput,
  editorRef,
  unscrambledContentRef,
}: JournalEditorProps) {
  const { getColor, getBgColor, hue, saturation, lightness } = useTheme();

  const lastContentLength = useRef<number>(0);
  const hasLoadedInitialContent = useRef<boolean>(false);
  const isCurrentlyTyping = useRef<boolean>(false);
  const previousTextContent = useRef<string>('');
  const scrambledDisplayText = useRef<string>('');

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

  // Initialize scrambled state when scramble mode is enabled
  useEffect(() => {
    if (isScrambled && editorRef.current && unscrambledContentRef) {
      // App.tsx has already scrambled the editor and saved real content to unscrambledContentRef
      // Wait a tick for App.tsx to finish scrambling
      setTimeout(() => {
        if (editorRef.current && unscrambledContentRef.current) {
          // Parse the real text from the saved HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = unscrambledContentRef.current;
          previousTextContent.current = tempDiv.textContent || '';
          // Get the scrambled display from the editor
          scrambledDisplayText.current = editorRef.current.textContent || '';
        }
      }, 10);
    } else {
      // Reset when unscrambled
      previousTextContent.current = '';
      scrambledDisplayText.current = '';
    }
  }, [isScrambled, editorRef, unscrambledContentRef]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    isCurrentlyTyping.current = true;

    // Get the current content (this is the real content before any scrambling)
    const currentHTML = editorRef.current.innerHTML || '';
    const newContent = editorRef.current.textContent || '';

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

    lastContentLength.current = newContent.length;

    // Handle scrambled mode typing
    if (isScrambled && unscrambledContentRef) {
      // The editor currently shows: previous scrambled text + newly typed chars
      const editorText = editorRef.current.textContent || '';
      const prevScrambled = scrambledDisplayText.current;
      const prevReal = previousTextContent.current;

      // Save cursor position
      const selection = window.getSelection();
      let cursorOffset = 0;
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editorRef.current);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        cursorOffset = preCaretRange.toString().length;
      }

      let newScrambled = prevScrambled;
      let newReal = prevReal;

      if (editorText.length > prevScrambled.length) {
        // Characters were added
        const addedCount = editorText.length - prevScrambled.length;
        // The cursor is right after the inserted characters
        const insertPos = cursorOffset - addedCount;
        // Get the new characters (these are unscrambled, just typed by user)
        const newChars = editorText.slice(insertPos, insertPos + addedCount);
        // Scramble them
        const scrambledNewChars = newChars.split('').map(scrambleChar).join('');
        // Insert into scrambled display at the right position
        newScrambled = prevScrambled.slice(0, insertPos) + scrambledNewChars + prevScrambled.slice(insertPos);
        // Also update the real content
        newReal = prevReal.slice(0, insertPos) + newChars + prevReal.slice(insertPos);
      } else if (editorText.length < prevScrambled.length) {
        // Characters were deleted
        const deletedCount = prevScrambled.length - editorText.length;
        // Find where deletion happened by comparing with previous scrambled
        let deletePos = 0;
        while (deletePos < editorText.length && editorText[deletePos] === prevScrambled[deletePos]) {
          deletePos++;
        }
        newScrambled = prevScrambled.slice(0, deletePos) + prevScrambled.slice(deletePos + deletedCount);
        newReal = prevReal.slice(0, deletePos) + prevReal.slice(deletePos + deletedCount);
      }

      // Update refs
      previousTextContent.current = newReal;
      scrambledDisplayText.current = newScrambled;

      // Save the real content as HTML
      unscrambledContentRef.current = newReal;
      onInput(newReal);

      // Update display with scrambled text
      editorRef.current.textContent = newScrambled;

      // Restore cursor position
      if (selection && editorRef.current) {
        const textNode = editorRef.current.firstChild || editorRef.current;
        const newRange = document.createRange();
        const safeOffset = Math.min(cursorOffset, newScrambled.length);
        if (textNode.nodeType === Node.TEXT_NODE) {
          newRange.setStart(textNode, safeOffset);
        } else {
          newRange.setStart(editorRef.current, 0);
        }
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else {
      onInput(editorRef.current.innerHTML || '');
      // Keep track for when scramble mode is enabled
      previousTextContent.current = editorRef.current.textContent || '';
      scrambledDisplayText.current = '';
    }

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
  }, [editorRef, onInput, isEmpty, isScrambled, unscrambledContentRef]);

  return (
    <div className="flex-1 p-8 relative overflow-y-auto" style={{ backgroundColor: getBgColor() }}>
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
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full h-full focus:outline-none text-base leading-relaxed font-mono font-bold whitespace-pre-wrap custom-editor dynamic-editor"
          spellCheck="false"
          suppressContentEditableWarning
        />
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

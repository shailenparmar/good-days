import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import { useKeyedPersisted } from '@shared/hooks';
import { getTodayDate } from '@shared/utils/date';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { JournalEntry } from '../types';

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

function scrambleText(text: string): string {
  let scrambled = '';
  for (const char of text) {
    scrambled += scrambleChar(char);
  }
  return scrambled;
}

interface JournalEditorProps {
  entries: JournalEntry[];
  selectedDate: string;
  isScrambled: boolean;
  onInput: (content: string) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
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

  // Local state for textarea value (synced with entries)
  const [value, setValue] = useState('');

  // Scroll position persistence
  const scrollPosition = useKeyedPersisted<number>('scrollPosition', 0);
  const scrollSaveTimeout = useRef<number | null>(null);

  // Track scroll for scramble overlay sync
  const [scrollTop, setScrollTop] = useState(0);

  // Placeholder animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = 'start typing';

  // Strip HTML tags from content (for migration from contentEditable)
  const stripHtml = (html: string): string => {
    if (!html) return '';
    // Replace <br> and </div><div> with newlines, then strip remaining tags
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>\s*<div>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  };

  // Load content when date changes
  useEffect(() => {
    if (loadedDateRef.current === selectedDate) return;

    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';
    // Strip HTML in case we're loading old contentEditable content
    const textContent = stripHtml(content);
    setValue(textContent);

    // Restore scroll position after content loads
    // Use double requestAnimationFrame to ensure content is fully rendered
    const savedScrollTop = scrollPosition.get(selectedDate);
    if (savedScrollTop > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.scrollTop = savedScrollTop;
          }
        });
      });
    }
    loadedDateRef.current = selectedDate;
  }, [entries, selectedDate, editorRef, scrollPosition]);

  // Handle scroll - persist position and sync overlay
  const handleScroll = useCallback(() => {
    if (!editorRef.current) return;

    // Immediately sync overlay scroll (no debounce for smooth visual)
    setScrollTop(editorRef.current.scrollTop);

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

  // Handle input changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let newValue = e.target.value;
    let cursorPosition = e.target.selectionStart;

    // Track typing while scrambled
    if (isScrambled) {
      markEasterEggFound('scrambleTyping');
    }

    // Check for \time command and replace with timestamp
    const lowerValue = newValue.toLowerCase();
    const timeIndex = lowerValue.indexOf('\\time');
    if (timeIndex !== -1) {
      const now = new Date();
      const use24Hour = getItem('timeFormat') === '24h';
      const timestamp = now.toLocaleTimeString('en-US', {
        hour12: !use24Hour,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
      const timestampText = `[${timestamp}]`;

      // Replace \time with timestamp
      newValue = newValue.substring(0, timeIndex) + timestampText + newValue.substring(timeIndex + 5);

      // Adjust cursor position to be after the timestamp
      cursorPosition = timeIndex + timestampText.length;

      markEasterEggFound('timeCommand');

      // Preserve scroll position and set cursor after React updates the value
      const savedScroll = editorRef.current?.scrollTop ?? 0;
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.scrollTop = savedScroll;
          editorRef.current.selectionStart = cursorPosition;
          editorRef.current.selectionEnd = cursorPosition;
        }
      });
    }

    setValue(newValue);
    onInput(newValue);
  }, [editorRef, isScrambled, onInput]);

  // Force plain text paste (strips any formatting or styled Unicode)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Handle special keys
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Block Tab from leaving editor
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }

  }, [onInput]);

  // Focus the editor and notify parent
  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
    onClick?.();
  }, [editorRef, onClick]);

  // Check if this is today's entry (the only editable entry)
  const isToday = selectedDate === getTodayDate();

  // Memoize scrambled text so it doesn't re-scramble on every render
  const scrambledValue = useMemo(() => scrambleText(value), [value]);

  // Placeholder visibility
  const showPlaceholder = isToday && !value && !isFocused;

  // Placeholder animation
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
      className="flex-1 relative"
      style={{ backgroundColor: getBgColor() }}
      onClick={handleContainerClick}
    >
      <style>
        {`
          .journal-textarea {
            caret-color: ${getColor()};
          }
          @supports (caret-shape: block) {
            .journal-textarea {
              caret-shape: block;
            }
          }
        `}
      </style>

      {/* Textarea editor */}
      <textarea
        ref={editorRef}
        value={value}
        onChange={isToday ? handleChange : undefined}
        onPaste={isToday ? handlePaste : undefined}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        readOnly={!isToday}
        wrap="soft"
        className="absolute inset-0 p-8 w-full h-full resize-none overflow-y-auto scrollbar-hide focus:outline-none text-base leading-relaxed font-mono font-bold bg-transparent border-none journal-textarea whitespace-pre-wrap break-words"
        style={{ color: isScrambled ? 'transparent' : getColor() }}
        spellCheck={false}
        aria-label={isToday ? 'Journal entry content' : 'Journal entry (read-only)'}
      />

      {/* Scrambled overlay - shows scrambled text when in scramble mode */}
      {isScrambled && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="p-8 text-base leading-relaxed font-mono font-bold whitespace-pre-wrap break-words"
            style={{ color: getColor(), transform: `translateY(-${scrollTop}px)` }}
          >
            {scrambledValue}
          </div>
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

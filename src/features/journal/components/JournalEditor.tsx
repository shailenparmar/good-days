import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import { useKeyedPersisted } from '@shared/hooks';
import { getTodayDate } from '@shared/utils/date';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { JournalEntry } from '../types';

// Convert hex color (#RRGGBB) to HSL values
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

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
  isSuperscramble?: boolean;
  onInput: (content: string) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  externalContentVersion?: number;
  onClick?: () => void;
  hidePlaceholder?: boolean;
  scrambleSeed?: number;
}

export function JournalEditor({
  entries,
  selectedDate,
  isScrambled,
  isSuperscramble,
  onInput,
  editorRef,
  externalContentVersion,
  onClick,
  hidePlaceholder,
  scrambleSeed,
}: JournalEditorProps) {
  const { getColor, getBgColor, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, trackCurrentColorway } = useTheme();

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

  // Custom block cursor for Safari (no caret-shape: block support).
  // Uses a text overlay approach: renders all text transparently with a colored
  // block at the cursor position, matching the textarea's wrapping exactly.
  const needsCustomCursor = useMemo(() => {
    return typeof CSS === 'undefined' || !CSS.supports('caret-shape', 'block');
  }, []);
  const [cursorState, setCursorState] = useState({ pos: 0, version: 0, collapsed: true });

  const updateCursorTracking = useCallback(() => {
    if (!needsCustomCursor || !editorRef.current) return;
    const el = editorRef.current;
    setCursorState(prev => {
      const pos = el.selectionStart;
      const collapsed = el.selectionStart === el.selectionEnd;
      if (prev.pos === pos && prev.collapsed === collapsed) return prev;
      return { pos, version: prev.version + 1, collapsed };
    });
  }, [needsCustomCursor, editorRef]);

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

  // Load content when date changes or another tab updates current date
  const prevVersionRef = useRef(externalContentVersion);
  useEffect(() => {
    const isExternalUpdate = externalContentVersion !== prevVersionRef.current;
    prevVersionRef.current = externalContentVersion;

    if (loadedDateRef.current === selectedDate && !isExternalUpdate) return;

    const entry = entries.find(e => e.date === selectedDate);
    const content = entry?.content || '';
    // Strip HTML in case we're loading old contentEditable content
    const textContent = stripHtml(content);
    setValue(textContent);

    // Restore scroll position after content loads (only on date change, not external sync)
    if (!isExternalUpdate) {
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
    }
    // Only mark as loaded if we actually found the entry
    // (entries might still be loading from IndexedDB on initial mount)
    if (entry) loadedDateRef.current = selectedDate;
  }, [entries, selectedDate, editorRef, scrollPosition, externalContentVersion]);

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
    // Track typing while in superscramble mode (settings + about + scramble)
    if (isSuperscramble) {
      markEasterEggFound('superscramble');
    }

    // Backslash commands: process all matches before updating state
    let commandFired = false;

    // \time — replace with timestamp (loop for multiple)
    const timeRegex = /\\time(?![a-z])/i;
    let timeMatch = newValue.match(timeRegex);
    if (timeMatch) {
      const now = new Date();
      const use24Hour = getItem('timeFormat') === '24h';
      const timestamp = now.toLocaleTimeString('en-US', {
        hour12: !use24Hour,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
      const timestampText = `[${timestamp}]`;

      while (timeMatch) {
        const i = timeMatch.index!;
        newValue = newValue.substring(0, i) + timestampText + newValue.substring(i + 5);
        cursorPosition = i + timestampText.length;
        timeMatch = newValue.match(timeRegex);
      }

      markEasterEggFound('timeCommand');
      commandFired = true;
    }

    // \txt, \bg, \# — change theme colors and vanish (loop for multiple)
    const colorRegex = /\\(txt|bg)?:?\s*#([0-9a-f]{6})(?:\s+h(\d+)\s+s(\d+)\s+l(\d+))?/i;
    let colorMatch = newValue.match(colorRegex);
    if (colorMatch) {
      while (colorMatch) {
        const type = (colorMatch[1] || 'bg').toLowerCase();
        let h: number, s: number, l: number;

        if (colorMatch[3] !== undefined) {
          h = parseInt(colorMatch[3], 10);
          s = parseInt(colorMatch[4], 10);
          l = parseInt(colorMatch[5], 10);
        } else {
          const hsl = hexToHsl(colorMatch[2]);
          h = hsl.h; s = hsl.s; l = hsl.l;
        }

        if (type === 'txt') {
          setHue(h); setSaturation(s); setLightness(l);
        } else {
          setBgHue(h); setBgSaturation(s); setBgLightness(l);
        }

        const i = colorMatch.index!;
        newValue = newValue.substring(0, i) + newValue.substring(i + colorMatch[0].length);
        cursorPosition = i;
        colorMatch = newValue.match(colorRegex);
      }

      trackCurrentColorway();
      commandFired = true;
    }

    // Shared scroll/cursor restore for all backslash commands
    if (commandFired) {
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
  }, [editorRef, isScrambled, isSuperscramble, onInput, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, trackCurrentColorway]);

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
  // Suppress unused variable warning - scrambleSeed is used to trigger re-scrambles
  void scrambleSeed;
  const scrambledValue = useMemo(() => scrambleText(value), [value, scrambleSeed]);

  // Placeholder visibility — hide when another input (title, password) has focus
  const showPlaceholder = isToday && !value && !isFocused && !hidePlaceholder;

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

  // Reset animation when placeholder appears or date changes
  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder, selectedDate]);

  // Custom cursor: determine character at cursor position
  const cursorChar = value[cursorState.pos];
  const cursorCharIsReal = !!cursorChar && cursorChar !== '\n';

  return (
    <div
      className="flex-1 relative"
      style={{ backgroundColor: getBgColor() }}
      onClick={handleContainerClick}
    >
      <style>
        {`
          .journal-textarea {
            caret-color: ${needsCustomCursor ? 'transparent' : getColor()};
          }
          @supports (caret-shape: block) {
            .journal-textarea {
              caret-color: ${getColor()};
              caret-shape: block;
            }
          }
          @keyframes safari-cursor-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
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
        onSelect={needsCustomCursor ? updateCursorTracking : undefined}
        onFocus={() => { setIsFocused(true); updateCursorTracking(); }}
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

      {/* Custom block cursor for Safari (no caret-shape: block support).
          Renders all text transparent with a colored block at cursor position.
          Wrapping matches the textarea exactly since styling is identical. */}
      {needsCustomCursor && isFocused && cursorState.collapsed && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="p-8 text-base leading-relaxed font-mono font-bold whitespace-pre-wrap break-words"
            style={{ transform: `translateY(-${scrollTop}px)` }}
          >
            <span style={{ color: 'transparent' }}>
              {value.substring(0, cursorState.pos)}
            </span>
            <span
              key={cursorState.version}
              style={{
                backgroundColor: getColor(),
                animation: 'safari-cursor-blink 1s step-end infinite',
              }}
            >
              {cursorCharIsReal
                ? <span style={{ color: 'transparent' }}>{cursorChar}</span>
                : '\u00A0'
              }
            </span>
            <span style={{ color: 'transparent' }}>
              {value.substring(cursorState.pos + (cursorCharIsReal ? 1 : 0))}
            </span>
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

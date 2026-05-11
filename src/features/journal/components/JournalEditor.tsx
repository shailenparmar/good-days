import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import { useKeyedPersisted } from '@shared/hooks';
import { getTodayDate } from '@shared/utils/date';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { JournalEntry } from '../types';

// Convert HSL values to hex color (#RRGGBB)
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

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
  decryptedDates?: Set<string>;
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
  decryptedDates,
  onClick,
  hidePlaceholder,
  scrambleSeed,
}: JournalEditorProps) {
  const { getColor, getBgColor, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, trackCurrentColorway, incrementColorPickerDragCount, prePickerSnapshotRef } = useTheme();

  // Track focus state for placeholder visibility
  const [isFocused, setIsFocused] = useState(false);

  // Track which date we've loaded to prevent re-loading same content
  const loadedDateRef = useRef<string | null>(null);

  // Local state for textarea value (synced with entries)
  const [value, setValue] = useState('');

  // Scroll position persistence
  const scrollPosition = useKeyedPersisted<number>('scrollPosition', 0);
  const scrollSaveTimeout = useRef<number | null>(null);

  // Track scroll for scramble/cursor overlay sync — direct DOM refs for zero-lag
  const [scrollTop, setScrollTop] = useState(0);
  const scrambleOverlayRef = useRef<HTMLDivElement>(null);
  const cursorOverlayRef = useRef<HTMLDivElement>(null);

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

    const isDecrypted = decryptedDates?.has(selectedDate) ?? true;

    // Re-run the load whenever the date hasn't been decrypted yet — Phase A
    // emits a stub entry with empty content; the real content arrives later
    // via Phase B / prefetch / lazy decrypt. Without re-running, the editor
    // would lock onto the empty stub and ignore the decrypted content.
    if (loadedDateRef.current === selectedDate && isDecrypted && !isExternalUpdate) return;

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
    // Mark as loaded once entries has loaded at all AND this date is fully
    // decrypted. If the entry is still an index-only stub (encrypted, content
    // empty), leave loadedDateRef alone so the next entries update — when
    // Phase B / lazy / prefetch fills in the real content — re-runs the load.
    if (isDecrypted && (entry || entries.length > 0)) loadedDateRef.current = selectedDate;
  }, [entries, selectedDate, editorRef, scrollPosition, externalContentVersion, decryptedDates]);

  // Handle scroll - persist position and sync overlay
  const handleScroll = useCallback(() => {
    if (!editorRef.current) return;

    // Sync overlays directly on DOM — same frame as native scroll, no React lag
    const st = editorRef.current.scrollTop;
    if (scrambleOverlayRef.current) scrambleOverlayRef.current.style.transform = `translateY(-${st}px)`;
    if (cursorOverlayRef.current) cursorOverlayRef.current.style.transform = `translateY(-${st}px)`;
    setScrollTop(st);

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
      }).toLowerCase();
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

    // \color — replace with current theme colors (txt + bg hex and HSL)
    const colorInfoRegex = /\\color(?![a-z])/i;
    let colorInfoMatch = newValue.match(colorInfoRegex);
    if (colorInfoMatch) {
      const txtHex = hslToHex(hue, saturation, lightness);
      const bgHex = hslToHex(bgHue, bgSaturation, bgLightness);
      const colorText = `txt: ${txtHex} h${hue} s${saturation} l${lightness}\nbg: ${bgHex} h${bgHue} s${bgSaturation} l${bgLightness}`;

      while (colorInfoMatch) {
        const i = colorInfoMatch.index!;
        newValue = newValue.substring(0, i) + colorText + newValue.substring(i + 6);
        cursorPosition = i + colorText.length;
        colorInfoMatch = newValue.match(colorInfoRegex);
      }

      commandFired = true;
    }

    // \t, \txt, \text, \b, \bg, \background, \# — change theme colors and vanish (loop for multiple)
    const colorRegex = /\\(text|txt|t|background|bg|b)?:?\s*#([0-9a-f]{6})(?:\s+h(\d+)\s+s(\d+)\s+l(\d+))?/i;
    let colorMatch = newValue.match(colorRegex);
    if (colorMatch) {
      // Snapshot current colors for undo + pulse save button
      prePickerSnapshotRef.current = { hue, sat: saturation, light: lightness, bgHue, bgSat: bgSaturation, bgLight: bgLightness };
      incrementColorPickerDragCount();
      while (colorMatch) {
        const raw = (colorMatch[1] || 'bg').toLowerCase();
        const type = raw === 'text' || raw === 'txt' || raw === 't' ? 'txt' : 'bg';
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
    // Sync overlays directly + React state — prevents a 1-frame flash
    // where the scramble overlay has new text but old scroll position
    if (editorRef.current) {
      const st = editorRef.current.scrollTop;
      if (scrambleOverlayRef.current) scrambleOverlayRef.current.style.transform = `translateY(-${st}px)`;
      if (cursorOverlayRef.current) cursorOverlayRef.current.style.transform = `translateY(-${st}px)`;
      setScrollTop(st);
    }
    onInput(newValue);
  }, [editorRef, isScrambled, isSuperscramble, onInput, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, trackCurrentColorway, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, incrementColorPickerDragCount]);

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
        className="absolute inset-0 p-8 w-full h-full resize-none overflow-y-auto overflow-x-hidden scrollbar-hide focus:outline-none text-base leading-relaxed font-mono font-bold bg-transparent border-none journal-textarea whitespace-pre-wrap break-words"
        style={{ color: isScrambled ? 'transparent' : getColor(), overscrollBehavior: isScrambled ? 'none' : undefined }}
        spellCheck={false}
        aria-label={isToday ? 'Journal entry content' : 'Journal entry (read-only)'}
      />

      {/* Scrambled overlay - shows scrambled text when in scramble mode */}
      {isScrambled && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            ref={scrambleOverlayRef}
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
            ref={cursorOverlayRef}
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

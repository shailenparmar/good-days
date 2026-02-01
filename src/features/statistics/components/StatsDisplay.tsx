import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { formatTimeSpent } from '@shared/utils/date';
import { scrambleText } from '@shared/utils/scramble';
import { getEasterEggCount, markEasterEggFound, isEasterEggFound } from '@shared/utils/easterEggs';
import type { JournalEntry } from '../types';

interface StatsDisplayProps {
  entries: JournalEntry[];
  totalKeystrokes: number;
  totalSecondsOnApp: number;
  horizontal?: boolean;
  stacked?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
}

// Convert HSL to HEX
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

export function StatsDisplay({ entries, totalKeystrokes, totalSecondsOnApp, horizontal, stacked, superscramble, scrambleSeed }: StatsDisplayProps) {
  const { getColor, uniqueColorways, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness } = useTheme();
  const [liveStats, setLiveStats] = useState({ heapUsed: 0, domNodes: 0 });
  const [isRainbowMode, setIsRainbowMode] = useState(false);
  const [rainbowHue, setRainbowHue] = useState(0);

  // Bold sweep animation for easter eggs text
  const [eggBoldCount, setEggBoldCount] = useState(0);
  const [eggAnimPhase, setEggAnimPhase] = useState<'bold' | 'unbold' | 'idle'>('idle');

  // Color paste mode
  const [colorPasteMode, setColorPasteMode] = useState(false);
  const [colorPasteValue, setColorPasteValue] = useState('');
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Bold sweep animation for paste placeholder
  const [pasteBoldCount, setPasteBoldCount] = useState(0);
  const [pasteAnimPhase, setPasteAnimPhase] = useState<'bold' | 'unbold'>('bold');

  // Helper to scramble text in superscramble (scrambleSeed forces re-render)
  const s = (text: string) => superscramble ? scrambleText(text) : text;
  // Suppress unused variable warnings
  void scrambleSeed; // scrambleSeed triggers re-renders
  void liveStats; // liveStats tracked but not displayed yet

  // Track if we were in superscramble to refresh stats on exit
  const wasInSupermode = useRef(false);

  // Rainbow mode animation - just animates the easter eggs text color
  useEffect(() => {
    if (!isRainbowMode) return;

    // 360 degrees in 5 seconds = 72 degrees per second = ~1.2 degrees per 16ms frame
    const animate = () => {
      setRainbowHue(h => (h + 1.2) % 360);
    };

    const interval = setInterval(animate, 16); // ~60fps, full cycle in 5 seconds

    // Stop on click or keypress - but delay adding listeners so the starting click doesn't stop it
    const stopRainbow = (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsRainbowMode(false);
    };

    const timeoutId = setTimeout(() => {
      window.addEventListener('click', stopRainbow, true);
      window.addEventListener('keydown', stopRainbow, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
      window.removeEventListener('click', stopRainbow, true);
      window.removeEventListener('keydown', stopRainbow, true);
    };
  }, [isRainbowMode]);

  // Bold sweep animation for easter eggs text - loops while rainbow mode is active
  useEffect(() => {
    if (!isRainbowMode) {
      // Reset to idle when rainbow stops
      if (eggAnimPhase !== 'idle') {
        setEggAnimPhase('idle');
        setEggBoldCount(0);
      }
      return;
    }

    // Start animation when rainbow mode begins
    if (eggAnimPhase === 'idle') {
      setEggAnimPhase('bold');
      setEggBoldCount(0);
      return;
    }

    const eggText = '14/14 easter eggs';
    if (eggBoldCount >= eggText.length) {
      // Flip phase and reset count - keeps looping
      setEggAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setEggBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setEggBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [isRainbowMode, eggAnimPhase, eggBoldCount]);

  // Bold sweep animation for paste placeholder
  useEffect(() => {
    // Only animate when paste mode is active and input is empty
    if (!colorPasteMode || colorPasteValue.length > 0) {
      // Reset animation when entering paste mode or typing
      setPasteBoldCount(0);
      setPasteAnimPhase('bold');
      return;
    }

    const pasteText = 'paste';
    if (pasteBoldCount >= pasteText.length) {
      // Flip phase and reset count
      setPasteAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setPasteBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setPasteBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [colorPasteMode, colorPasteValue, pasteAnimPhase, pasteBoldCount]);

  // Handle click on easter eggs text - the secret 15th egg!
  // When user has all 14 regular eggs, shows "13.5/14" - clicking it completes the collection
  const handleEasterEggsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const eggCount = getEasterEggCount();
    const hasSecretEgg = isEasterEggFound('clickedEggCounter');

    // If at 14/14 regular eggs but haven't clicked yet (showing 13.5/14)
    if (eggCount.found === eggCount.total && !hasSecretEgg && !isRainbowMode) {
      markEasterEggFound('clickedEggCounter');
      setIsRainbowMode(true);
    }
    // If already completed (14/14), can still trigger rainbow mode again
    else if (eggCount.found === eggCount.total && hasSecretEgg && !isRainbowMode) {
      setIsRainbowMode(true);
    }
  }, [isRainbowMode]);

  // Update live stats every second when stacked, but freeze in superscramble
  useEffect(() => {
    if (!stacked) return;

    const updateLiveStats = () => {
      const heapUsed = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
      const domNodes = document.getElementsByTagName('*').length;
      setLiveStats({ heapUsed, domNodes });
    };

    // If exiting superscramble, immediately update stats
    if (wasInSupermode.current && !superscramble) {
      updateLiveStats();
    }
    wasInSupermode.current = !!superscramble;

    // Don't run interval in superscramble - freeze the display
    if (superscramble) return;

    updateLiveStats();
    const interval = setInterval(updateLiveStats, 1000);
    return () => clearInterval(interval);
  }, [stacked, superscramble]);

  const calculateStreak = () => {
    if (entries.length === 0) return 0;
    let streak = 0;
    const currentDate = new Date();

    while (true) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (entries.find(e => e.date === dateStr)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  const calculateTotalWords = () => {
    return entries.reduce((sum, e) => {
      const words = (e.content || '').split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);
  };

  const streak = calculateStreak();
  const totalWords = calculateTotalWords();

  // Calculate max streak ever
  const calculateMaxStreak = () => {
    if (entries.length === 0) return 0;
    let maxStreak = 0;
    let currentStreak = 0;

    // Sort entries by date
    const sortedDates = entries.map(e => e.date).sort();

    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        currentStreak = 1;
      } else {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStreak++;
        } else {
          currentStreak = 1;
        }
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }
    return maxStreak;
  };

  // Calculate unique words (lexicon)
  const calculateLexicon = () => {
    const allWords = new Set<string>();
    entries.forEach(e => {
      const words = (e.content || '')
        .toLowerCase()
        .replace(/<[^>]*>/g, ' ') // strip HTML
        .split(/\s+/)
        .filter(w => w.length > 0 && /^[a-z]+$/.test(w)); // only alphabetic words
      words.forEach(w => allWords.add(w));
    });
    return allWords.size;
  };

  // Hardcore technical stats
  const calculateTechnicalStats = () => {
    // localStorage usage
    let totalStorageBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        const bytes = new Blob([key + value]).size;
        totalStorageBytes += bytes;
      }
    }

    // localStorage limit is ~5MB in most browsers
    const usedStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(4);

    // First entry date for "age"
    const firstEntryDate = entries.length > 0 ? entries[entries.length - 1].date : null;
    const journalAgeMs = firstEntryDate ? Date.now() - new Date(firstEntryDate).getTime() : 0;

    // Entries per week (minimum 1 week to avoid inflated extrapolation)
    const weeksActive = Math.max(1, journalAgeMs / (1000 * 60 * 60 * 24 * 7));
    const entriesPerWeek = (entries.length / weeksActive).toFixed(2);

    const maxStreak = calculateMaxStreak();
    const lexicon = calculateLexicon();

    // Login count from localStorage
    const totalLogins = Number(localStorage.getItem('totalLogins') || '0');

    return {
      usedStorageMB,
      entriesPerWeek,
      maxStreak,
      lexicon,
      totalLogins,
    };
  };

  const techStats = stacked ? calculateTechnicalStats() : null;

  // Track when user clicks color text area (any click counts)
  const handleColorTextClick = useCallback(() => {
    markEasterEggFound('selectColorText');
  }, []);

  // Parse color values from pasted text
  // Supports: "txt: 120, 50%, 60%" or "bg: 200, 80%, 90%" or "120, 50%, 60%" or "#ff0000"
  const parseColorInput = useCallback((input: string) => {
    const trimmed = input.trim().toLowerCase();

    // Try HEX format: #rrggbb
    const hexMatch = trimmed.match(/#([0-9a-f]{6})/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;

      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }

      return {
        type: 'hsl' as const,
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
      };
    }

    // Try HSL format: "txt: 120, 50%, 60%" or "bg: 200, 80%, 90%" or just "120, 50%, 60%"
    const hslMatch = trimmed.match(/(?:(txt|bg):\s*)?(\d+),\s*(\d+)%?,\s*(\d+)%?/);
    if (hslMatch) {
      const type = hslMatch[1] as 'txt' | 'bg' | undefined;
      return {
        type: type || 'hsl' as const,
        h: parseInt(hslMatch[2]),
        s: parseInt(hslMatch[3]),
        l: parseInt(hslMatch[4])
      };
    }

    return null;
  }, []);

  // Handle double-click to enter paste mode
  const handleColorDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setColorPasteMode(true);
    setColorPasteValue('');
    // Focus input after render
    setTimeout(() => colorInputRef.current?.focus(), 0);
  }, []);

  // Handle paste input submission
  const handleColorPasteSubmit = useCallback(() => {
    const parsed = parseColorInput(colorPasteValue);
    if (parsed) {
      if (parsed.type === 'txt') {
        setHue(parsed.h);
        setSaturation(parsed.s);
        setLightness(parsed.l);
      } else if (parsed.type === 'bg') {
        setBgHue(parsed.h);
        setBgSaturation(parsed.s);
        setBgLightness(parsed.l);
      } else {
        // Just HSL - apply to text by default
        setHue(parsed.h);
        setSaturation(parsed.s);
        setLightness(parsed.l);
      }
    }
    setColorPasteMode(false);
    setColorPasteValue('');
  }, [colorPasteValue, parseColorInput, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness]);

  // Handle input blur or escape
  const handleColorPasteBlur = useCallback(() => {
    setColorPasteMode(false);
    setColorPasteValue('');
  }, []);

  const handleColorPasteKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleColorPasteSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleColorPasteBlur();
    }
  }, [handleColorPasteSubmit, handleColorPasteBlur]);

  if (horizontal) {
    return (
      <div className="flex justify-center gap-6 flex-wrap select-none">
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {s(`${streak} day streak`)}
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {s(`${entries.length} ${entries.length === 1 ? 'day' : 'days'} logged`)}
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {s(`${totalKeystrokes.toLocaleString()} keystrokes`)}
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {s(`${totalWords.toLocaleString()} words`)}
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {s(`${uniqueColorways} ${uniqueColorways === 1 ? 'colorway' : 'colorways'}`)}
        </div>
        <div className="text-xs font-mono font-bold whitespace-nowrap" style={{ color: getColor() }}>
          {s(formatTimeSpent(totalSecondsOnApp))}
        </div>
      </div>
    );
  }

  return (
    <div className="select-none">
      <div className="grid grid-cols-2 gap-x-0 gap-y-1">
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {s(`${streak} day ${streak === 1 ? 'streak' : 'streak'}`)}
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {s(`${entries.length} ${entries.length === 1 ? 'day' : 'days'} logged`)}
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {s(`${totalKeystrokes.toLocaleString()} keystrokes`)}
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {s(`${totalWords.toLocaleString()} words total`)}
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {s(`${uniqueColorways} ${uniqueColorways === 1 ? 'colorway' : 'colorways'}`)}
        </div>
        <div className="text-xs font-mono font-bold text-center whitespace-nowrap" style={{ color: getColor() }}>
          {s(formatTimeSpent(totalSecondsOnApp))}
        </div>
      </div>

      {/* Powerstat mode: technical stats + color codes */}
      {stacked && techStats && (
        <div className="mt-3 pt-3" style={{ borderTop: `2px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}>
          {/* Technical stats - not copy-pastable */}
          <div className="grid grid-cols-2 gap-x-0 gap-y-1">
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.maxStreak} day maxstreak`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.totalLogins} ${techStats.totalLogins === 1 ? 'login' : 'logins'}`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.usedStorageMB}/5 MB used`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.lexicon} word lexicon`)}
            </div>
            <div
              className="text-xs font-mono text-center"
              style={{ color: isRainbowMode ? `hsl(${rainbowHue}, 100%, 50%)` : getColor() }}
              onClick={handleEasterEggsClick}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const eggCount = getEasterEggCount();
                const hasSecretEgg = isEasterEggFound('clickedEggCounter');
                // Show 13.5/14 when all regular eggs found but secret not yet clicked
                const displayFound = (eggCount.found === eggCount.total && !hasSecretEgg)
                  ? '13.5'
                  : String(eggCount.found);
                const eggText = s(`${displayFound}/${eggCount.total} easter eggs`);

                // Bold sweep animation
                if (eggAnimPhase === 'bold') {
                  return (
                    <>
                      <span className="font-bold">{eggText.slice(0, eggBoldCount)}</span>
                      <span>{eggText.slice(eggBoldCount)}</span>
                    </>
                  );
                } else if (eggAnimPhase === 'unbold') {
                  return (
                    <>
                      <span>{eggText.slice(0, eggBoldCount)}</span>
                      <span className="font-bold">{eggText.slice(eggBoldCount)}</span>
                    </>
                  );
                }
                // Idle - show all bold
                return <span className="font-bold">{eggText}</span>;
              })()}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.entriesPerWeek} entries/week`)}
            </div>
          </div>
          {/* Color stats - copy-pastable, double-click to paste */}
          <div
            className="grid grid-cols-2 gap-x-0 gap-y-1 mt-3 pt-3 select-text"
            style={{ borderTop: `2px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`, cursor: 'text' }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleColorDoubleClick}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleColorTextClick();
            }}
          >
            {colorPasteMode ? (
              <div className="col-span-2 relative">
                <input
                  ref={colorInputRef}
                  type="text"
                  value={colorPasteValue}
                  onChange={(e) => setColorPasteValue(e.target.value)}
                  onKeyDown={handleColorPasteKeyDown}
                  onBlur={handleColorPasteBlur}
                  className="w-full text-xs font-mono font-bold text-center bg-transparent border-none outline-none relative z-10"
                  style={{ color: getColor() }}
                  autoComplete="off"
                  spellCheck={false}
                />
                {/* Animated placeholder with bold sweep */}
                {colorPasteValue.length === 0 && (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-xs font-mono pointer-events-none"
                    style={{ color: getColor(), opacity: 0.85 }}
                  >
                    {pasteAnimPhase === 'bold' ? (
                      <>
                        <span className="font-bold">{'paste'.slice(0, pasteBoldCount)}</span>
                        <span>{'paste'.slice(pasteBoldCount)}</span>
                      </>
                    ) : (
                      <>
                        <span>{'paste'.slice(0, pasteBoldCount)}</span>
                        <span className="font-bold">{'paste'.slice(pasteBoldCount)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="text-xs font-mono font-bold text-center" style={{ color: getColor(), cursor: 'text' }}>
                  txt: {hue}, {saturation}%, {lightness}%
                </div>
                <div className="text-xs font-mono font-bold text-center" style={{ color: getColor(), cursor: 'text' }}>
                  {hslToHex(hue, saturation, lightness)}
                </div>
                <div className="text-xs font-mono font-bold text-center" style={{ color: getColor(), cursor: 'text' }}>
                  bg: {bgHue}, {bgSaturation}%, {bgLightness}%
                </div>
                <div className="text-xs font-mono font-bold text-center" style={{ color: getColor(), cursor: 'text' }}>
                  {hslToHex(bgHue, bgSaturation, bgLightness)}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

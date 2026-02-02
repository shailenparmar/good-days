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

// Split button component for copy/paste
function ColorButton({
  onClick,
  children,
  position,
  getColor,
  hue,
  saturation,
  lightness
}: {
  onClick: () => void;
  children: React.ReactNode;
  position: 'left' | 'right';
  getColor: () => string;
  hue: number;
  saturation: number;
  lightness: number;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  // Check if mouse is already over button when it mounts
  useEffect(() => {
    if (buttonRef.current?.matches(':hover')) {
      setIsHovered(true);
    }
  }, []);

  const textColor = getColor();
  const borderColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const activeColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

  const getCurrentBorder = () => {
    if (isClicked) return activeColor;
    if (isHovered) return textColor;
    return borderColor;
  };

  const currentBorder = getCurrentBorder();

  const getBackground = () => {
    if (isHovered) return hoverBg;
    return 'transparent';
  };

  const borderStyle = position === 'left'
    ? { borderTop: `3px solid ${currentBorder}`, borderBottom: `3px solid ${currentBorder}`, borderLeft: `3px solid ${currentBorder}`, borderRight: `1px solid ${currentBorder}` }
    : { borderTop: `3px solid ${currentBorder}`, borderBottom: `3px solid ${currentBorder}`, borderRight: `3px solid ${currentBorder}`, borderLeft: `1px solid ${currentBorder}` };

  return (
    <button
      ref={buttonRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      tabIndex={-1}
      className={`flex-1 px-3 py-2 text-xs font-mono font-bold outline-none focus:outline-none select-none ${position === 'left' ? 'rounded-l' : 'rounded-r'}`}
      style={{
        color: textColor,
        backgroundColor: getBackground(),
        ...borderStyle,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsClicked(false); }}
      onMouseDown={() => setIsClicked(true)}
      onMouseUp={() => setIsClicked(false)}
    >
      {children}
    </button>
  );
}

export function StatsDisplay({ entries, totalKeystrokes, totalSecondsOnApp, horizontal, stacked, superscramble, scrambleSeed }: StatsDisplayProps) {
  const { getColor, uniqueColorways, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, customPresets, setCustomPresets, setSelectedPreset, setSelectedCustomPreset } = useTheme();
  const [liveStats, setLiveStats] = useState({ heapUsed: 0, domNodes: 0 });
  const [isRainbowMode, setIsRainbowMode] = useState(false);
  const [rainbowHue, setRainbowHue] = useState(0);

  // Bold sweep animation for easter eggs text
  const [eggBoldCount, setEggBoldCount] = useState(0);
  const [eggAnimPhase, setEggAnimPhase] = useState<'bold' | 'unbold' | 'idle'>('idle');

  // Color stats hover state
  const [colorAreaHovered, setColorAreaHovered] = useState(false);

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

    const eggText = '13/13 easter eggs';
    if (eggBoldCount >= eggText.length) {
      // Flip phase and reset count - keeps looping
      setEggAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setEggBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setEggBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [isRainbowMode, eggAnimPhase, eggBoldCount]);

  // Handle click on easter eggs text - the secret 15th egg!
  // When user has all 13 regular eggs, shows "12.5/13" - clicking it completes the collection
  const handleEasterEggsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const eggCount = getEasterEggCount();
    const hasSecretEgg = isEasterEggFound('clickedEggCounter');

    // If at 13/13 regular eggs but haven't clicked yet (showing 12.5/13)
    if (eggCount.found === eggCount.total && !hasSecretEgg && !isRainbowMode) {
      markEasterEggFound('clickedEggCounter');
      setIsRainbowMode(true);
    }
    // If already completed (13/13), can still trigger rainbow mode again
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

  // Handle copy button click - copies color values to clipboard
  const handleColorCopy = useCallback(() => {
    const textHsl = `txt: ${hue}, ${saturation}%, ${lightness}%`;
    const bgHsl = `bg: ${bgHue}, ${bgSaturation}%, ${bgLightness}%`;
    const copyText = `${textHsl}\n${bgHsl}`;
    navigator.clipboard.writeText(copyText);
    setColorAreaHovered(false);
  }, [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]);

  // Handle paste button click - read from clipboard, apply, and create new preset
  const handleColorPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Collect parsed values
      let txtH = hue, txtS = saturation, txtL = lightness;
      let bgH = bgHue, bgS = bgSaturation, bgL = bgLightness;
      let foundAny = false;

      // Try to parse each line
      const lines = text.split('\n');
      for (const line of lines) {
        const parsed = parseColorInput(line);
        if (parsed) {
          foundAny = true;
          if (parsed.type === 'txt') {
            txtH = parsed.h;
            txtS = parsed.s;
            txtL = parsed.l;
          } else if (parsed.type === 'bg') {
            bgH = parsed.h;
            bgS = parsed.s;
            bgL = parsed.l;
          } else {
            // Just HSL or HEX - apply to text by default
            txtH = parsed.h;
            txtS = parsed.s;
            txtL = parsed.l;
          }
        }
      }

      if (foundAny) {
        // Apply the colors
        setHue(txtH);
        setSaturation(txtS);
        setLightness(txtL);
        setBgHue(bgH);
        setBgSaturation(bgS);
        setBgLightness(bgL);

        // Create a new custom preset
        const newPreset = {
          hue: txtH,
          sat: txtS,
          light: txtL,
          bgHue: bgH,
          bgSat: bgS,
          bgLight: bgL,
        };
        setCustomPresets([...customPresets, newPreset]);
        // Select the new preset
        setSelectedPreset(null);
        setSelectedCustomPreset(customPresets.length);

        // Easter egg for successfully pasting a colorway
        markEasterEggFound('selectColorText');
      }
    } catch {
      // Clipboard access denied or empty
    }
    setColorAreaHovered(false);
  }, [parseColorInput, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, customPresets, setCustomPresets, setSelectedPreset, setSelectedCustomPreset]);

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
                // Show 12.5/13 when all regular eggs found but secret not yet clicked
                const displayFound = (eggCount.found === eggCount.total && !hasSecretEgg)
                  ? '12.5'
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
          {/* Color stats - hover to show copy/paste buttons */}
          {/* Both elements rendered, one hidden - wrapper uses larger height */}
          <div
            className="mt-3 pt-3 relative"
            style={{
              borderTop: `2px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setColorAreaHovered(true)}
            onMouseLeave={() => setColorAreaHovered(false)}
          >
            {/* Buttons - visible when hovered */}
            <div
              className="flex items-center"
              style={{ visibility: colorAreaHovered ? 'visible' : 'hidden', position: colorAreaHovered ? 'relative' : 'absolute', top: 0, left: 0, right: 0 }}
            >
              <ColorButton
                onClick={handleColorCopy}
                position="left"
                getColor={getColor}
                hue={hue}
                saturation={saturation}
                lightness={lightness}
              >
                {s('copy')}
              </ColorButton>
              <ColorButton
                onClick={handleColorPaste}
                position="right"
                getColor={getColor}
                hue={hue}
                saturation={saturation}
                lightness={lightness}
              >
                {s('paste')}
              </ColorButton>
            </div>
            {/* Color stats - visible when not hovered */}
            <div
              className="grid grid-cols-2 gap-x-0 gap-y-1"
              style={{ visibility: colorAreaHovered ? 'hidden' : 'visible', position: colorAreaHovered ? 'absolute' : 'relative', top: 0, left: 0, right: 0 }}
            >
              <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
                txt: {hue}, {saturation}%, {lightness}%
              </div>
              <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
                {hslToHex(hue, saturation, lightness)}
              </div>
              <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
                bg: {bgHue}, {bgSaturation}%, {bgLightness}%
              </div>
              <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
                {hslToHex(bgHue, bgSaturation, bgLightness)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '@features/theme';
import { formatTimeSpent } from '@shared/utils/date';
import { scrambleText } from '@shared/utils/scramble';
import { getEasterEggCount, markEasterEggFound, isEasterEggFound } from '@shared/utils/easterEggs';
import { getStorageEstimate } from '@shared/storage/journalStorage';
import { getItem } from '@shared/storage';
import { getStatusColors } from '@shared/utils/confirmColor';
import type { JournalEntry } from '../types';

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

interface StatsDisplayProps {
  entries: JournalEntry[];
  totalKeystrokes: number;
  totalSecondsOnApp: number;
  horizontal?: boolean;
  stacked?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
}

// Split button component for copy/paste
function ColorButton({
  onClick,
  children,
  position,
  getColor,
}: {
  onClick: () => void;
  children: React.ReactNode;
  position: 'left' | 'right';
  getColor: () => string;
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
  const borderColor = 'hsla(var(--h), var(--s), var(--l), 0.6)';
  const activeColor = 'hsl(var(--h), var(--s), max(0%, calc(var(--l) * 0.65)))';
  const hoverBg = 'hsla(var(--h), var(--s), 50%, 0.2)';

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
  const { getColor, uniqueColorways, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, presets, customPresets, setCustomPresets, setSelectedPreset, setSelectedCustomPreset, setActivePresetIndex } = useTheme();
  const { error: errorColor } = useMemo(
    () => getStatusColors(hue, saturation, lightness, bgHue, bgSaturation, bgLightness),
    [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]
  );
  const [liveStats, setLiveStats] = useState({ heapUsed: 0, domNodes: 0 });
  const [isRainbowMode, setIsRainbowMode] = useState(false);
  const [rainbowHue, setRainbowHue] = useState(0);

  // Storage info from IndexedDB/Storage API
  const [storageInfo, setStorageInfo] = useState<{ used: string; quota: string } | null>(null);

  // Bold sweep animation for easter eggs text
  const [eggBoldCount, setEggBoldCount] = useState(0);
  const [eggAnimPhase, setEggAnimPhase] = useState<'bold' | 'unbold' | 'idle'>('idle');

  // Color stats hover state
  const [colorAreaHovered, setColorAreaHovered] = useState(false);
  const [pasteInvalid, setPasteInvalid] = useState(false);

  // pasteInvalid is dismissed by mouseLeave on the color stats hover region

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
    const stopRainbow = () => {
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

    const eggText = '8/8 easter eggs';
    if (eggBoldCount >= eggText.length) {
      // Flip phase and reset count - keeps looping
      setEggAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setEggBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setEggBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [isRainbowMode, eggAnimPhase, eggBoldCount]);

  // Handle click on easter eggs text - the secret 8th egg!
  // When user has all 7 regular eggs, shows "6.5/7" - clicking it completes the collection
  const handleEasterEggsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const eggCount = getEasterEggCount();
    const hasSecretEgg = isEasterEggFound('clickedEggCounter');

    // If at 7/7 regular eggs but haven't clicked yet (showing 6.5/7)
    if (eggCount.found === eggCount.total && !hasSecretEgg && !isRainbowMode) {
      markEasterEggFound('clickedEggCounter');
      setIsRainbowMode(true);
    }
    // If already completed (7/7), can still trigger rainbow mode again
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

  // Fetch storage estimate when stacked mode is active
  useEffect(() => {
    if (!stacked) return;
    if (superscramble) return; // Freeze display in superscramble

    getStorageEstimate().then(({ used, quota }) => {
      const usedMB = (used / (1024 * 1024)).toFixed(2);
      // Show quota in appropriate unit (MB for small, GB for large)
      let quotaDisplay: string;
      const quotaMB = quota / (1024 * 1024);
      if (quotaMB >= 1024) {
        // Show in GB for large quotas
        const quotaGB = (quotaMB / 1024).toFixed(1);
        quotaDisplay = `${quotaGB} GB`;
      } else {
        quotaDisplay = `${Math.round(quotaMB)} MB`;
      }
      setStorageInfo({ used: usedMB, quota: quotaDisplay });
    });
  }, [stacked, superscramble]);

  // Memoize expensive stats calculations — these depend only on entries,
  // not colors. Without memoization, they recalculate on every color change
  // during 60fps streaming (O(N*M) lexicon + O(N log N) sort = 50-200ms/frame).
  const streak = useMemo(() => {
    if (entries.length === 0) return 0;
    let s = 0;
    const currentDate = new Date();

    while (true) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (entries.find(e => e.date === dateStr)) {
        s++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    return s;
  }, [entries]);

  const totalWords = useMemo(() => {
    return entries.reduce((sum, e) => {
      const words = (e.content || '').split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);
  }, [entries]);

  const techStats = useMemo(() => {
    if (!stacked) return null;

    // Max streak
    let maxStreak = 0;
    if (entries.length > 0) {
      let currentStreak = 0;
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
    }

    // Lexicon
    const allWords = new Set<string>();
    entries.forEach(e => {
      const words = (e.content || '')
        .toLowerCase()
        .replace(/<[^>]*>/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0 && /^[a-z]+$/.test(w));
      words.forEach(w => allWords.add(w));
    });
    const lexicon = allWords.size;

    // Age + entries per week
    const firstEntryDate = entries.length > 0 ? entries[entries.length - 1].date : null;
    const journalAgeMs = firstEntryDate ? Date.now() - new Date(firstEntryDate).getTime() : 0;
    const weeksActive = Math.max(1, journalAgeMs / (1000 * 60 * 60 * 24 * 7));
    const entriesPerWeek = (entries.length / weeksActive).toFixed(2);

    const totalLogins = Number(getItem('totalLogins') || '0');

    return { entriesPerWeek, maxStreak, lexicon, totalLogins };
  }, [entries, stacked]);

  // Parse color values from pasted text
  // Supports: "txt: 120, 50%, 60%" or "bg: 200, 80%, 90%" or "120, 50%, 60%" or "#ff0000"
  const parseColorInput = useCallback((input: string) => {
    const trimmed = input.trim();
    const match = trimmed.match(/^(txt|bg):\s*#[0-9a-f]{6}\s+h(\d+)\s+s(\d+)\s+l(\d+)/i);
    if (match) {
      return { type: match[1].toLowerCase() as 'txt' | 'bg', h: parseInt(match[2]), s: parseInt(match[3]), l: parseInt(match[4]) };
    }
    return null;
  }, []);

  // Handle copy button click - copies hex + hsl color values to clipboard
  const handleColorCopy = useCallback(() => {
    const textLine = `txt: ${hslToHex(hue % 360, saturation, lightness)} h${hue % 360} s${saturation} l${lightness}`;
    const bgLine = `bg: ${hslToHex(bgHue % 360, bgSaturation, bgLightness)} h${bgHue % 360} s${bgSaturation} l${bgLightness}`;
    const copyText = `${textLine}\n${bgLine}`;
    navigator.clipboard.writeText(copyText);
    markEasterEggFound('selectColorText');
    setColorAreaHovered(false);
  }, [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]);

  // Handle paste button click - read from clipboard, apply, and create new preset
  const handleColorPaste = useCallback(async () => {
    markEasterEggFound('selectColorText');
    try {
      let text = await navigator.clipboard.readText();
      // Decode URL-encoded clipboard text (mobile browsers may encode)
      try { text = decodeURIComponent(text); } catch { /* not encoded, use as-is */ }
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
        // Select and focus the new preset
        setSelectedPreset(null);
        setSelectedCustomPreset(customPresets.length);
        setActivePresetIndex(presets.length + customPresets.length);
        setColorAreaHovered(false);
      } else {
        setPasteInvalid(true);
      }
    } catch {
      // Clipboard access denied or empty
    }
  }, [parseColorInput, hue, saturation, lightness, bgHue, bgSaturation, bgLightness, setHue, setSaturation, setLightness, setBgHue, setBgSaturation, setBgLightness, presets, customPresets, setCustomPresets, setSelectedPreset, setSelectedCustomPreset, setActivePresetIndex]);

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

      {/* Poweruser mode: technical stats + color codes */}
      {stacked && techStats && (
        <div className="mt-3 pt-3" style={{ borderTop: '2px solid hsla(var(--h), var(--s), var(--l), 0.85)' }}>
          {/* Technical stats - not copy-pastable */}
          <div className="grid grid-cols-2 gap-x-0 gap-y-1">
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.maxStreak} day maxstreak`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.totalLogins} ${techStats.totalLogins === 1 ? 'login' : 'logins'}`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${storageInfo?.used || '0.00'} MB / ${storageInfo?.quota || '5 MB'}`)}
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
                // Show N-0.5/N when all regular eggs found but secret not yet clicked
                const displayFound = (eggCount.found === eggCount.total && !hasSecretEgg)
                  ? String(eggCount.total - 0.5)
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
          {/* Grid overlay: both elements in same cell, container = max(both heights) */}
          <div
            className="mt-3 pt-3"
            style={{
              borderTop: '2px solid hsla(var(--h), var(--s), var(--l), 0.85)',
            }}
          >
            <div
              style={{
                display: 'grid',
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setColorAreaHovered(true)}
              onMouseLeave={() => { setPasteInvalid(false); setColorAreaHovered(false); }}
            >
              {/* Both elements in same grid cell - container sizes to larger one */}
              <div
                className="flex items-center"
                style={{ gridRow: 1, gridColumn: 1, visibility: (colorAreaHovered || pasteInvalid) ? 'visible' : 'hidden' }}
              >
                {pasteInvalid ? (
                  <div
                    className="flex-1 px-3 py-2 text-xs font-mono font-bold text-center rounded select-none"
                    style={{
                      color: errorColor,
                      border: `3px solid ${errorColor}`,
                    }}
                  >
                    {s('invalid format')}
                  </div>
                ) : (
                  <>
                    <ColorButton
                      onClick={handleColorCopy}
                      position="left"
                      getColor={getColor}
                    >
                      {s('copy')}
                    </ColorButton>
                    <ColorButton
                      onClick={handleColorPaste}
                      position="right"
                      getColor={getColor}
                    >
                      {s('paste')}
                    </ColorButton>
                  </>
                )}
              </div>
              <div
                className="grid grid-cols-2 gap-x-0 gap-y-1"
                style={{ gridRow: 1, gridColumn: 1, visibility: (colorAreaHovered || pasteInvalid) ? 'hidden' : 'visible' }}
              >
                <div className="text-xs font-mono font-bold cursor-text text-center" style={{ color: getColor() }}>
                  txt: {hslToHex(hue % 360, saturation, lightness)}
                </div>
                <div className="text-xs font-mono font-bold cursor-text text-center" style={{ color: getColor() }}>
                  bg: {hslToHex(bgHue % 360, bgSaturation, bgLightness)}
                </div>
                <div className="text-xs font-mono font-bold cursor-text text-center" style={{ color: getColor() }}>
                  h{hue % 360} s{saturation} l{lightness}
                </div>
                <div className="text-xs font-mono font-bold cursor-text text-center" style={{ color: getColor() }}>
                  h{bgHue % 360} s{bgSaturation} l{bgLightness}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { formatTimeSpent } from '@shared/utils/date';
import { scrambleText } from '@shared/utils/scramble';
import { getEasterEggCount, markEasterEggFound } from '@shared/utils/easterEggs';
import type { JournalEntry } from '../types';

interface StatsDisplayProps {
  entries: JournalEntry[];
  totalKeystrokes: number;
  totalSecondsOnApp: number;
  horizontal?: boolean;
  stacked?: boolean;
  supermode?: boolean;
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

export function StatsDisplay({ entries, totalKeystrokes, totalSecondsOnApp, horizontal, stacked, supermode, scrambleSeed }: StatsDisplayProps) {
  const { getColor, uniqueColorways, hue, saturation, lightness, bgHue, bgSaturation, bgLightness } = useTheme();
  const [liveStats, setLiveStats] = useState({ heapUsed: 0, domNodes: 0 });

  // Helper to scramble text in supermode (scrambleSeed forces re-render)
  const s = (text: string) => supermode ? scrambleText(text) : text;
  // Suppress unused variable warnings
  void scrambleSeed; // scrambleSeed triggers re-renders
  void liveStats; // liveStats tracked but not displayed yet

  // Track if we were in supermode to refresh stats on exit
  const wasInSupermode = useRef(false);

  // Update live stats every second when stacked, but freeze in supermode
  useEffect(() => {
    if (!stacked) return;

    const updateLiveStats = () => {
      const heapUsed = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
      const domNodes = document.getElementsByTagName('*').length;
      setLiveStats({ heapUsed, domNodes });
    };

    // If exiting supermode, immediately update stats
    if (wasInSupermode.current && !supermode) {
      updateLiveStats();
    }
    wasInSupermode.current = !!supermode;

    // Don't run interval in supermode - freeze the display
    if (supermode) return;

    updateLiveStats();
    const interval = setInterval(updateLiveStats, 1000);
    return () => clearInterval(interval);
  }, [stacked, supermode]);

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
    const STORAGE_LIMIT = 5 * 1024 * 1024;
    const remainingStorage = Math.max(0, STORAGE_LIMIT - totalStorageBytes);

    // First entry date for "age"
    const firstEntryDate = entries.length > 0 ? entries[entries.length - 1].date : null;
    const journalAgeMs = firstEntryDate ? Date.now() - new Date(firstEntryDate).getTime() : 0;

    // Entries per week
    const weeksActive = journalAgeMs / (1000 * 60 * 60 * 24 * 7);
    const entriesPerWeek = weeksActive > 0 ? (entries.length / weeksActive).toFixed(2) : '0';

    const maxStreak = calculateMaxStreak();
    const lexicon = calculateLexicon();

    // Login count from localStorage
    const totalLogins = Number(localStorage.getItem('totalLogins') || '0');

    return {
      remainingStorage,
      entriesPerWeek,
      maxStreak,
      lexicon,
      totalLogins,
    };
  };

  const techStats = stacked ? calculateTechnicalStats() : null;

  // Track when user selects color text
  const handleColorTextSelect = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      markEasterEggFound('selectColorText');
    }
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

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
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
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
        <div className="mt-3 pt-3" style={{ borderTop: `2px solid ${getColor()}` }}>
          {/* Technical stats - not copy-pastable */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.maxStreak} day maxstreak`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.totalLogins} ${techStats.totalLogins === 1 ? 'login' : 'logins'}`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${formatBytes(techStats.remainingStorage)} remaining`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.lexicon} word lexicon`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${getEasterEggCount().found}/${getEasterEggCount().total} easter eggs`)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {s(`${techStats.entriesPerWeek} entries/week`)}
            </div>
          </div>
          {/* Color stats - copy-pastable */}
          <div
            className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 pt-3 select-text"
            style={{ borderTop: `2px solid ${getColor()}` }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => {
              e.stopPropagation();
              handleColorTextSelect();
            }}
          >
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {hue}, {saturation}%, {lightness}%
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {hslToHex(hue, saturation, lightness)}
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {bgHue}, {bgSaturation}%, {bgLightness}%
            </div>
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              {hslToHex(bgHue, bgSaturation, bgLightness)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

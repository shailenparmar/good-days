import { useTheme } from '@features/theme';
import { formatTimeSpent } from '@shared/utils/date';
import type { JournalEntry } from '../types';

interface StatsDisplayProps {
  entries: JournalEntry[];
  totalKeystrokes: number;
  totalSecondsOnApp: number;
  horizontal?: boolean;
  stacked?: boolean;
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

export function StatsDisplay({ entries, totalKeystrokes, totalSecondsOnApp, horizontal, stacked }: StatsDisplayProps) {
  const { getColor, uniqueColorways, hue, saturation, lightness, bgHue, bgSaturation, bgLightness } = useTheme();

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

  const calculateWordCounts = () => {
    return entries.map(e => ({
      date: e.date,
      words: (e.content || '').split(/\s+/).filter(Boolean).length
    }));
  };

  const streak = calculateStreak();
  const totalWords = calculateTotalWords();
  const wordCounts = stacked ? calculateWordCounts() : [];

  // Stacked mode calculations
  const avgWordsPerEntry = entries.length > 0 ? Math.round(totalWords / entries.length) : 0;
  const longestEntry = wordCounts.length > 0
    ? wordCounts.reduce((max, e) => e.words > max.words ? e : max, wordCounts[0])
    : null;
  const firstEntryDate = entries.length > 0 ? entries[entries.length - 1].date : null;
  const daysSinceFirst = firstEntryDate
    ? Math.floor((Date.now() - new Date(firstEntryDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Color codes
  const textHsl = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const textHex = hslToHex(hue, saturation, lightness);
  const bgHsl = `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`;
  const bgHex = hslToHex(bgHue, bgSaturation, bgLightness);

  if (horizontal) {
    return (
      <div className="flex justify-center gap-6 flex-wrap select-none">
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {streak} day streak
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {entries.length} {entries.length === 1 ? 'day' : 'days'} logged
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {totalKeystrokes.toLocaleString()} keystrokes
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {totalWords.toLocaleString()} words
        </div>
        <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
          {uniqueColorways} {uniqueColorways === 1 ? 'colorway' : 'colorways'}
        </div>
        <div className="text-xs font-mono font-bold whitespace-nowrap" style={{ color: getColor() }}>
          {formatTimeSpent(totalSecondsOnApp)}
        </div>
      </div>
    );
  }

  // Format date like "jan 15, 2025"
  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  return (
    <div className="select-none">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {streak} day {streak === 1 ? 'streak' : 'streak'}
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {entries.length} {entries.length === 1 ? 'day' : 'days'} logged
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {totalKeystrokes.toLocaleString()} keystrokes
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {totalWords.toLocaleString()} words total
        </div>
        <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
          {uniqueColorways} {uniqueColorways === 1 ? 'colorway' : 'colorways'}
        </div>
        <div className="text-xs font-mono font-bold text-center whitespace-nowrap" style={{ color: getColor() }}>
          {formatTimeSpent(totalSecondsOnApp)}
        </div>
      </div>

      {/* Stacked mode: extra nerdy stats */}
      {stacked && (
        <div className="mt-3 pt-3 space-y-1" style={{ borderTop: `2px solid ${getColor()}` }}>
          {/* Color codes */}
          <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
            {textHsl}
          </div>
          <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
            {textHex}
          </div>
          <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
            {bgHsl}
          </div>
          <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
            {bgHex}
          </div>

          {/* Extra stats */}
          <div className="text-xs font-mono font-bold text-center pt-2" style={{ color: getColor() }}>
            {avgWordsPerEntry} avg words/entry
          </div>
          {longestEntry && longestEntry.words > 0 && (
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              longest: {longestEntry.words} words
            </div>
          )}
          {firstEntryDate && (
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              journaling {daysSinceFirst} days
            </div>
          )}
          {firstEntryDate && (
            <div className="text-xs font-mono font-bold text-center" style={{ color: getColor() }}>
              since {formatShortDate(firstEntryDate)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

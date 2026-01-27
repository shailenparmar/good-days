import { useTheme } from '@features/theme';
import { formatTimeSpent } from '@shared/utils/date';
import type { JournalEntry } from '../types';

interface StatsDisplayProps {
  entries: JournalEntry[];
  totalKeystrokes: number;
  totalSecondsOnApp: number;
  horizontal?: boolean;
}

export function StatsDisplay({ entries, totalKeystrokes, totalSecondsOnApp, horizontal }: StatsDisplayProps) {
  const { getColor, uniqueColorways } = useTheme();

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

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 select-none">
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
  );
}

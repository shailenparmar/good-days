import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import type { JournalEntry } from '../types';

interface EntryHeaderProps {
  selectedDate: string;
  entries: JournalEntry[];
  paddingBottom?: number;
  onClick?: (e: React.MouseEvent) => void;
  onHeightChange?: (height: number) => void;
}

export function EntryHeader({ selectedDate, entries, paddingBottom = 20, onClick, onHeightChange }: EntryHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);

  // Report height changes
  useEffect(() => {
    if (!onHeightChange || !headerRef.current) return;

    const reportHeight = () => {
      if (headerRef.current) {
        onHeightChange(headerRef.current.offsetHeight);
      }
    };

    reportHeight();

    const observer = new ResizeObserver(reportHeight);
    observer.observe(headerRef.current);

    return () => observer.disconnect();
  }, [onHeightChange]);
  const { getColor, getBgColor, hue, saturation, lightness } = useTheme();
  const [use24Hour, setUse24Hour] = useState(() => getItem('timeFormat') === '24h');

  // Listen for storage changes to update time format
  useEffect(() => {
    const handleStorage = () => setUse24Hour(getItem('timeFormat') === '24h');
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 100); // Poll for same-tab changes
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const entry = entries.find(e => e.date === selectedDate);

  const getStartedAtText = () => {
    if (entry?.startedAt) {
      const date = new Date(entry.startedAt);
      if (use24Hour) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `started at ${hours}:${minutes}:${seconds}`;
      } else {
        return `started at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}`;
      }
    }
    const date = new Date(selectedDate + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).toLowerCase();
  };

  return (
    <div
      ref={headerRef}
      className="p-4 sticky top-0 z-10"
      style={{
        paddingBottom: `${paddingBottom}px`,
        backgroundColor: `hsl(${getBgColor().match(/\d+/g)![0]}, ${getBgColor().match(/\d+/g)![1]}%, ${Math.min(100, Number(getBgColor().match(/\d+/g)![2]) + 2)}%)`,
        borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={onClick}
    >
      <div className="flex justify-between items-baseline select-none">
        <h2 className="text-lg font-extrabold font-mono" style={{ color: getColor() }}>
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).toLowerCase()}
        </h2>
        <p className="font-extrabold font-mono" style={{ color: getColor(), fontSize: '14.5px' }}>
          {getStartedAtText()}
        </p>
      </div>
    </div>
  );
}

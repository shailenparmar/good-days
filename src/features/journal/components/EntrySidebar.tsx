import { useEffect, useState, useRef } from 'react';
import { useTheme } from '@features/theme';
import { formatDate } from '@shared/utils/date';
import { scrambleText } from '@shared/utils/scramble';
import type { JournalEntry } from '../types';

interface EntrySidebarProps {
  entries: JournalEntry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  settingsOpen?: boolean;
  stacked?: boolean;
  supermode?: boolean;
  scrambleSeed?: number;
}

export function EntrySidebar({ entries, selectedDate, onSelectDate, settingsOpen, stacked, supermode, scrambleSeed }: EntrySidebarProps) {
  // Suppress unused variable warning - scrambleSeed triggers re-renders
  void scrambleSeed;

  // Helper to scramble text in supermode
  const s = (text: string) => supermode ? scrambleText(text) : text;
  const { getColor, hue, saturation, lightness } = useTheme();
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);
  const [clickedEntry, setClickedEntry] = useState<string | null>(null);
  const [keyboardFocusedEntry, setKeyboardFocusedEntry] = useState<string | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Clear keyboard focus when settings opens
  useEffect(() => {
    if (settingsOpen) {
      setKeyboardFocusedEntry(null);
    }
  }, [settingsOpen]);

  // Scroll focused entry into view
  useEffect(() => {
    if (keyboardFocusedEntry) {
      const button = buttonRefs.current.get(keyboardFocusedEntry);
      button?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [keyboardFocusedEntry]);

  // Arrow key navigation (only when settings is closed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if settings is open
      if (settingsOpen) return;

      // Don't handle if focus is on an input, textarea, or contenteditable
      const activeElement = document.activeElement;
      const isInEditor = activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement)?.isContentEditable;

      // Handle Enter/Space for navigation only if NOT in editor
      if ((e.key === 'Enter' || e.key === ' ') && keyboardFocusedEntry && !isInEditor) {
        e.preventDefault();
        onSelectDate(keyboardFocusedEntry);
        setKeyboardFocusedEntry(null);
        return;
      }

      if (isInEditor) {
        return;
      }

      if (entries.length === 0) return;

      const currentIndex = entries.findIndex(entry => entry.date === selectedDate);

      // Use keyboard focus index if set, otherwise use selected date
      const focusedIndex = keyboardFocusedEntry
        ? entries.findIndex(entry => entry.date === keyboardFocusedEntry)
        : currentIndex;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const baseIndex = focusedIndex !== -1 ? focusedIndex : currentIndex;
        if (baseIndex === -1 || baseIndex === 0) return;
        const newIndex = baseIndex - 1;
        setKeyboardFocusedEntry(entries[newIndex].date);
        onSelectDate(entries[newIndex].date);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const baseIndex = focusedIndex !== -1 ? focusedIndex : currentIndex;
        if (baseIndex === -1 || baseIndex === entries.length - 1) return;
        const newIndex = baseIndex + 1;
        setKeyboardFocusedEntry(entries[newIndex].date);
        onSelectDate(entries[newIndex].date);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entries, selectedDate, onSelectDate, settingsOpen, keyboardFocusedEntry]);

  if (entries.length === 0) {
    return null;
  }

  const textColor = getColor();
  const borderColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;
  const activeColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;

  return (
    <nav className="p-4 space-y-2" role="navigation" aria-label="Journal entries">
      {entries.map(entry => {
        const isSelected = entry.date === selectedDate;
        const isHovered = hoveredEntry === entry.date || keyboardFocusedEntry === entry.date;
        const isClicked = clickedEntry === entry.date;

        // Clicked = darkened border, selected or hovered = full border, otherwise = 60% border
        const currentBorderColor = isClicked ? activeColor : ((isSelected || isHovered) ? textColor : borderColor);
        // Selected or hovered = filled background
        const currentBg = (isSelected || isHovered) ? hoverBg : 'transparent';

        // In powerstat mode, show "1/28/2026 9:24 AM" format with startedAt time
        let displayText: string;
        if (stacked && entry.startedAt) {
          const date = new Date(entry.startedAt);
          displayText = date.toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } else {
          displayText = formatDate(entry.date);
        }

        return (
          <div
            key={entry.date}
            ref={(el) => {
              if (el) buttonRefs.current.set(entry.date, el as unknown as HTMLButtonElement);
            }}
            onClick={() => {
              setKeyboardFocusedEntry(null);
              onSelectDate(entry.date);
            }}
            onMouseEnter={() => {
              if (!keyboardFocusedEntry) {
                setHoveredEntry(entry.date);
              }
            }}
            onMouseLeave={() => { setHoveredEntry(null); setClickedEntry(null); }}
            onMouseDown={() => setClickedEntry(entry.date)}
            onMouseUp={() => setClickedEntry(null)}
            tabIndex={-1}
            role="button"
            aria-label={`Journal entry for ${displayText}${isSelected ? ', selected' : ''}`}
            aria-pressed={isSelected}
            className="w-full text-center px-3 py-2 rounded font-mono font-extrabold outline-none focus:outline-none select-none"
            style={{
              fontSize: '14px',
              border: `3px solid ${currentBorderColor}`,
              color: textColor,
              backgroundColor: currentBg,
            }}
          >
            {s(displayText)}
          </div>
        );
      })}
    </nav>
  );
}

import { useEffect, useState, useRef } from 'react';
import { useTheme } from '@features/theme';
import { formatDate } from '@shared/utils/date';
import type { JournalEntry } from '../types';

interface EntrySidebarProps {
  entries: JournalEntry[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSaveTitle: (date: string, title: string) => void;
  settingsOpen?: boolean;
}

export function EntrySidebar({ entries, selectedDate, onSelectDate, onSaveTitle, settingsOpen }: EntrySidebarProps) {
  const { getColor, hue, saturation, lightness } = useTheme();
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);
  const [clickedEntry, setClickedEntry] = useState<string | null>(null);
  const [keyboardFocusedEntry, setKeyboardFocusedEntry] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Clear keyboard focus when settings opens
  useEffect(() => {
    if (settingsOpen) {
      setKeyboardFocusedEntry(null);
      setEditingEntry(null);
    }
  }, [settingsOpen]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingEntry) {
      const input = inputRefs.current.get(editingEntry);
      input?.focus();
      input?.select();
    }
  }, [editingEntry]);

  const handleStartEdit = (date: string, currentTitle: string | undefined) => {
    setEditingEntry(date);
    setEditValue(currentTitle || '');
  };

  const handleSaveEdit = (date: string) => {
    onSaveTitle(date, editValue);
    setEditingEntry(null);
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setEditValue('');
  };

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
    <div className="p-4 space-y-2">
      {entries.map(entry => {
        const isSelected = entry.date === selectedDate;
        const isHovered = hoveredEntry === entry.date || keyboardFocusedEntry === entry.date;
        const isClicked = clickedEntry === entry.date;

        // Clicked = darkened border, selected or hovered = full border, otherwise = 60% border
        const currentBorderColor = isClicked ? activeColor : ((isSelected || isHovered) ? textColor : borderColor);
        // Selected or hovered = filled background
        const currentBg = (isSelected || isHovered) ? hoverBg : 'transparent';

        const isEditing = editingEntry === entry.date;
        const displayText = entry.title || formatDate(entry.date);

        return (
          <div
            key={entry.date}
            ref={(el) => {
              if (el) buttonRefs.current.set(entry.date, el as unknown as HTMLButtonElement);
            }}
            onClick={() => {
              if (!isEditing) {
                setKeyboardFocusedEntry(null);
                onSelectDate(entry.date);
              }
            }}
            onMouseEnter={() => {
              if (!keyboardFocusedEntry && !isEditing) {
                setHoveredEntry(entry.date);
              }
            }}
            onMouseLeave={() => { setHoveredEntry(null); setClickedEntry(null); }}
            onMouseDown={() => !isEditing && setClickedEntry(entry.date)}
            onMouseUp={() => setClickedEntry(null)}
            tabIndex={-1}
            className="w-full text-center px-3 py-2 rounded font-mono font-extrabold outline-none focus:outline-none select-none"
            style={{
              fontSize: '0.9rem',
              border: `3px solid ${currentBorderColor}`,
              color: textColor,
              backgroundColor: currentBg,
            }}
          >
            {isEditing ? (
              <input
                ref={(el) => {
                  if (el) inputRefs.current.set(entry.date, el);
                }}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value.slice(0, 24))}
                onBlur={() => handleSaveEdit(entry.date)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit(entry.date);
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                maxLength={24}
                placeholder={formatDate(entry.date)}
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent text-center font-mono font-extrabold outline-none p-0 m-0"
                style={{ fontSize: '0.9rem', color: textColor, border: 'none' }}
              />
            ) : (
              <span
                onClick={(e) => {
                  if (isSelected) {
                    e.stopPropagation();
                    handleStartEdit(entry.date, entry.title);
                  }
                }}
              >
                {displayText}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

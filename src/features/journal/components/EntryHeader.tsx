import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@features/theme';
import { getItem } from '@shared/storage';
import { scrambleText } from '@shared/utils/scramble';
import type { JournalEntry } from '../types';

interface EntryHeaderProps {
  selectedDate: string;
  entries: JournalEntry[];
  paddingBottom?: number;
  isScrambled?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
  stacked?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onHeightChange?: (height: number) => void;
  saveTitle?: (date: string, title: string) => void;
  onEditingChange?: (editing: boolean) => void;
  editorRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function EntryHeader({ selectedDate, entries, paddingBottom = 20, isScrambled, superscramble, scrambleSeed, stacked, onClick, onHeightChange, saveTitle, onEditingChange, editorRef }: EntryHeaderProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;
  const headerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [titleScrollLeft, setTitleScrollLeft] = useState(0);

  // "set title" placeholder sweep animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = 'set title';
  const showPlaceholder = isEditingTitle && titleInput.length === 0;

  useEffect(() => {
    if (!showPlaceholder) return;
    const nextCount = boldCount + 1;
    if (boldCount >= placeholderText.length) {
      setAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setBoldCount(0);
      return;
    }
    const timer = setTimeout(() => setBoldCount(nextCount), 83);
    return () => clearTimeout(timer);
  }, [showPlaceholder, boldCount, animPhase]);

  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder]);

  // Notify parent when editing state changes
  useEffect(() => {
    onEditingChange?.(isEditingTitle);
  }, [isEditingTitle, onEditingChange]);

  // Reset editing when selected date changes
  useEffect(() => {
    setIsEditingTitle(false);
  }, [selectedDate]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
    }
  }, [isEditingTitle]);

  // Sync scramble overlay scroll with input scrollLeft
  useEffect(() => {
    if (!isEditingTitle || !(isScrambled || superscramble)) return;
    const frame = requestAnimationFrame(() => {
      if (titleInputRef.current) {
        setTitleScrollLeft(titleInputRef.current.scrollLeft);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [titleInput, isEditingTitle, isScrambled, superscramble]);

  const syncTitleScroll = () => {
    requestAnimationFrame(() => {
      if (titleInputRef.current) {
        setTitleScrollLeft(titleInputRef.current.scrollLeft);
      }
    });
  };

  const handleDateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const entry = entries.find(en => en.date === selectedDate);
    setTitleInput(entry?.title || '');
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (saveTitle) {
      saveTitle(selectedDate, titleInput);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.preventDefault();
      handleTitleSave();
      requestAnimationFrame(() => {
        if (editorRef?.current) {
          editorRef.current.focus();
          const len = editorRef.current.value.length;
          editorRef.current.selectionStart = len;
          editorRef.current.selectionEnd = len;
        }
      });
    } else if (e.key === 'Tab') {
      e.stopPropagation();
      e.preventDefault();
      handleTitleSave();
      requestAnimationFrame(() => {
        if (editorRef?.current) {
          editorRef.current.focus();
          const len = editorRef.current.value.length;
          editorRef.current.selectionStart = len;
          editorRef.current.selectionEnd = len;
        }
      });
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      handleTitleSave();
    }
  };

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
  const { getColor } = useTheme();
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
        if (stacked) {
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `started at ${hours}:${minutes}:${seconds}`;
        }
        return `started at ${hours}:${minutes}`;
      } else {
        const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
        if (stacked) options.second = '2-digit';
        return `started at ${date.toLocaleTimeString('en-US', options)}`;
      }
    }
    const date = new Date(selectedDate + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).toLowerCase();
  };

  const dateText = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).toLowerCase();

  return (
    <div
      ref={headerRef}
      className="p-4 sticky top-0 z-10"
      style={{
        paddingBottom: `${paddingBottom}px`,
        backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
        borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)'
      }}
      onClick={onClick}
      onMouseDown={(e) => {
        // Prevent double/triple click from selecting text in editor
        if (e.detail >= 2) {
          e.preventDefault();
        }
      }}
    >
      <div className="flex justify-between items-baseline select-none">
        {isEditingTitle ? (
          <div
            className="relative flex-1 mr-2 min-w-0"
            onMouseDown={() => titleInputRef.current?.blur()}
          >
            <input
              ref={titleInputRef}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onSelect={syncTitleScroll}
              className="text-lg font-extrabold font-mono bg-transparent outline-none border-none p-0 m-0"
              style={{ width: `${(titleInput.length || placeholderText.length) + 1}ch`, maxWidth: '100%', color: (isScrambled || superscramble) && titleInput ? 'transparent' : getColor(), caretColor: getColor() }}
            />
            {(isScrambled || superscramble) && titleInput.length > 0 && (
              <div
                className="absolute top-0 left-0 text-lg font-extrabold font-mono pointer-events-none select-none overflow-hidden whitespace-nowrap w-full"
                style={{ color: getColor() }}
              >
                <span style={{ display: 'inline-block', transform: `translateX(-${titleScrollLeft}px)` }}>
                  {scrambleText(titleInput)}
                </span>
              </div>
            )}
            {showPlaceholder && (
              <div
                className="absolute top-0 left-0 text-lg font-mono pointer-events-none select-none"
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
        ) : (
          <h2
            className="text-lg font-extrabold font-mono overflow-hidden text-ellipsis whitespace-nowrap flex-1 mr-2"
            style={{ color: getColor() }}
          >
            <span onClick={saveTitle ? handleDateClick : undefined}>
              {entry?.title ? (isScrambled || superscramble ? scrambleText(entry.title) : entry.title) : s(dateText)}
            </span>
          </h2>
        )}
        <p className="font-extrabold font-mono whitespace-nowrap flex-shrink-0" style={{ color: getColor(), fontSize: '14px' }}>
          {s(getStartedAtText())}
        </p>
      </div>
    </div>
  );
}

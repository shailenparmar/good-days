import { useState, useEffect, useRef, useCallback } from 'react';
import { getItem, setItem, forceSave } from '@shared/storage';
import { getTodayDate } from '@shared/utils/date';
import type { JournalEntry } from '../types';

// Validate a single journal entry
function isValidEntry(entry: unknown): entry is JournalEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
  if (typeof e.content !== 'string') return false;
  if (e.title !== undefined && typeof e.title !== 'string') return false;
  if (e.startedAt !== undefined && typeof e.startedAt !== 'number') return false;
  if (e.lastModified !== undefined && typeof e.lastModified !== 'number') return false;
  return true;
}

// Safely parse and validate journal entries from storage
function parseAndValidateEntries(json: string): JournalEntry[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    console.error('Failed to parse journal entries');
    return [];
  }
}

// Load entries synchronously at initialization
function loadEntriesFromStorage(): JournalEntry[] {
  const saved = getItem('journalEntries');
  if (saved) {
    return parseAndValidateEntries(saved);
  }
  return [];
}

export function useJournalEntries() {
  // Load entries SYNCHRONOUSLY during initialization - never start with empty array
  const [entries, setEntries] = useState<JournalEntry[]>(() => loadEntriesFromStorage());
  const [selectedDate, setSelectedDateState] = useState<string>(() => {
    // Restore last viewed date, or default to today
    const saved = getItem('selectedDate');
    return saved || getTodayDate();
  });
  const [currentContent, setCurrentContent] = useState<string>('');

  const previousDate = useRef<string | null>(null);
  const lastTypedTime = useRef<number>(
    (() => {
      const saved = getItem('lastTypedTime');
      return saved ? Number(saved) : Date.now();
    })()
  );

  // Track latest state in refs for beforeunload (can't access state in event handlers)
  const entriesRef = useRef<JournalEntry[]>(entries);
  const pendingSaveRef = useRef<{ content: string; date: string } | null>(null);

  // Keep entriesRef in sync
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Force save before closing
  useEffect(() => {
    const handleBeforeUnload = () => {
      forceSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Ensure today's entry always exists
  useEffect(() => {
    const today = getTodayDate();
    const todayEntry = entries.find(e => e.date === today);

    if (!todayEntry && entries.length > 0) {
      const newEntries = [...entries, {
        date: today,
        content: '',
        startedAt: Date.now(),
      }].sort((a, b) => b.date.localeCompare(a.date));

      entriesRef.current = newEntries;
      setEntries(newEntries);
      setItem('journalEntries', JSON.stringify(newEntries));
    }
  }, [entries]);

  // Wrapper to persist selected date to localStorage
  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date);
    setItem('selectedDate', date);
  }, []);

  // Handle date changes - update currentContent and lastTypedTime
  useEffect(() => {
    const isDateSwitch = previousDate.current !== null && previousDate.current !== selectedDate;

    const entry = entries.find(e => e.date === selectedDate);

    // Update currentContent with text content (for word/char count)
    // Replace <br> and block elements with newlines before extracting text
    const html = entry?.content || '';
    const withLineBreaks = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = withLineBreaks;
    setCurrentContent(tempDiv.textContent || '');

    if (entry && entry.lastModified && isDateSwitch) {
      lastTypedTime.current = entry.lastModified;
      setItem('lastTypedTime', String(entry.lastModified));
    }

    previousDate.current = selectedDate;
  }, [selectedDate, entries]);

  // Save content
  const saveEntry = useCallback((content: string, timestamp?: number) => {
    const now = Date.now();

    // Get text content from HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const textContent = tempDiv.textContent || '';

    // Normalize content: if no actual text, save empty string (not <br> or other empty HTML)
    const normalizedContent = textContent.trim() === '' ? '' : content;

    const isToday = selectedDate === getTodayDate();

    // Build new entries using ref (synchronous, not affected by React batching)
    const currentEntries = entriesRef.current;
    const existingIndex = currentEntries.findIndex(e => e.date === selectedDate);
    let newEntries: JournalEntry[];

    if (textContent.trim() === '') {
      if (isToday) {
        if (existingIndex >= 0) {
          newEntries = [...currentEntries];
          newEntries[existingIndex] = {
            date: selectedDate,
            content: normalizedContent,
            title: currentEntries[existingIndex].title,
            startedAt: currentEntries[existingIndex].startedAt || timestamp || now,
            lastModified: now,
          };
        } else {
          newEntries = [...currentEntries, {
            date: selectedDate,
            content: normalizedContent,
            startedAt: timestamp || now,
            lastModified: now,
          }];
        }
      } else {
        newEntries = currentEntries.filter(e => e.date !== selectedDate);
      }
    } else if (existingIndex >= 0) {
      newEntries = [...currentEntries];
      newEntries[existingIndex] = {
        date: selectedDate,
        content,
        title: currentEntries[existingIndex].title,
        startedAt: currentEntries[existingIndex].startedAt || timestamp || now,
        lastModified: now,
      };
    } else {
      newEntries = [...currentEntries, {
        date: selectedDate,
        content,
        startedAt: timestamp || now,
        lastModified: now,
      }];
    }

    newEntries.sort((a, b) => b.date.localeCompare(a.date));

    // Save to localStorage IMMEDIATELY (synchronous, before React can batch)
    setItem('journalEntries', JSON.stringify(newEntries));

    // Update ref immediately too
    entriesRef.current = newEntries;

    // Clear pending save since we just saved
    pendingSaveRef.current = null;

    // Update React state (can be batched, but localStorage already has the data)
    setEntries(newEntries);

    lastTypedTime.current = now;
    setItem('lastTypedTime', String(now));
  }, [selectedDate]);

  // Save title for an entry
  const saveTitle = useCallback((date: string, title: string) => {
    setEntries(prevEntries => {
      const existingIndex = prevEntries.findIndex(e => e.date === date);
      if (existingIndex < 0) return prevEntries;

      const newEntries = [...prevEntries];
      newEntries[existingIndex] = {
        ...newEntries[existingIndex],
        title: title.trim() || undefined, // Remove title if empty
      };

      setItem('journalEntries', JSON.stringify(newEntries));
      return newEntries;
    });
  }, []);

  // Reload entries from storage (used after unlock)
  const reloadEntries = useCallback(() => {
    const saved = getItem('journalEntries');
    if (saved) {
      const loadedEntries = parseAndValidateEntries(saved);
      setEntries(loadedEntries);

      const entry = loadedEntries.find((e: JournalEntry) => e.date === selectedDate);
      const content = entry?.content || '';
      setCurrentContent(content);
      return content;
    }
    return '';
  }, [selectedDate]);

  return {
    entries,
    selectedDate,
    currentContent,
    setEntries,
    setSelectedDate,
    setCurrentContent,
    saveEntry,
    saveTitle,
    reloadEntries,
    lastTypedTime,
  };
}

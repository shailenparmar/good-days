import { useState, useEffect, useRef, useCallback } from 'react';
import { getItem, setItem } from '@shared/storage';
import { initJournalStorage, saveSingleEntry, deleteSingleEntry, flushPendingSaves, onEntrySaved, loadSingleEntry } from '@shared/storage/journalStorage';
import { getTodayDate } from '@shared/utils/date';
import { logAction } from '@shared/logger';
import type { JournalEntry } from '../types';

// Convert HTML to plain text, preserving line breaks for word counting
export function htmlToText(html: string): string {
  try {
    // Replace <br> and closing block tags with newlines before extracting text
    const withLineBreaks = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/blockquote>/gi, '\n');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = withLineBreaks;
    return tempDiv.textContent || '';
  } catch {
    // If HTML parsing fails, return the raw string stripped of tags
    return html.replace(/<[^>]*>/g, '');
  }
}

export function useJournalEntries() {
  // Start with empty entries - will be loaded async from IndexedDB
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Load entries from IndexedDB on mount
  useEffect(() => {
    let mounted = true;

    initJournalStorage().then(loadedEntries => {
      if (!mounted) return;

      setEntries(loadedEntries);
      entriesRef.current = loadedEntries;
      setIsLoading(false);
      logAction('journal.loaded', { entryCount: loadedEntries.length });

      // Update current content for selected date
      const entry = loadedEntries.find(e => e.date === selectedDate);
      setCurrentContent(htmlToText(entry?.content || ''));
    });

    return () => {
      mounted = false;
    };
  }, []); // Only run on mount

  // Force save before closing - use sync localStorage as backup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      // Flush any debounced saves to IndexedDB (best-effort, async)
      flushPendingSaves();
      // Sync backup to localStorage (IndexedDB writes may not complete before tab closes)
      if (entriesRef.current.length > 0) {
        logAction('journal.beforeunload', { entryCount: entriesRef.current.length });
        try {
          localStorage.setItem('journalEntries', JSON.stringify(entriesRef.current));
        } catch (e) {
          console.error('[gdays] beforeunload: localStorage backup failed', e);
          logAction('journal.beforeunload.fail');
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Listen for saves from other tabs (multi-tab sync)
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  useEffect(() => {
    const unsubscribe = onEntrySaved(async (date: string) => {
      // Another tab saved this date - reload it from storage
      const entry = await loadSingleEntry(date);
      if (!entry) return;

      console.log(`[gdays] multi-tab: other tab saved ${date}, reloading`);
      logAction('journal.multitab.reload', { date });

      setEntries(prev => {
        const index = prev.findIndex(e => e.date === date);
        const updated = [...prev];
        if (index >= 0) {
          updated[index] = entry;
        } else {
          updated.push(entry);
          updated.sort((a, b) => b.date.localeCompare(a.date));
        }
        entriesRef.current = updated;
        return updated;
      });

      // If we're viewing this date, update the displayed content
      if (selectedDateRef.current === date) {
        setCurrentContent(htmlToText(entry.content || ''));
      }
    });

    return unsubscribe;
  }, []);

  // Ensure today's entry always exists
  useEffect(() => {
    if (isLoading) return; // Wait for initial load

    const today = getTodayDate();
    const todayEntry = entries.find(e => e.date === today);

    if (!todayEntry && entries.length > 0) {
      const newTodayEntry: JournalEntry = {
        date: today,
        content: '',
      };
      const newEntries = [...entries, newTodayEntry].sort((a, b) => b.date.localeCompare(a.date));

      entriesRef.current = newEntries;
      setEntries(newEntries);
      // Only save the new today entry (safe for multi-tab)
      saveSingleEntry(newTodayEntry);
    }
  }, [entries, isLoading]);

  // Wrapper to persist selected date to localStorage
  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(prev => {
      if (prev !== date) logAction('journal.dateChange', { from: prev, to: date });
      return date;
    });
    setItem('selectedDate', date);
  }, []);

  // Handle date changes - update currentContent and lastTypedTime
  useEffect(() => {
    if (isLoading) return; // Wait for initial load

    const isDateSwitch = previousDate.current !== null && previousDate.current !== selectedDate;

    const entry = entries.find(e => e.date === selectedDate);

    // Update currentContent with text content (for word/char count)
    setCurrentContent(htmlToText(entry?.content || ''));

    if (entry && entry.lastModified && isDateSwitch) {
      lastTypedTime.current = entry.lastModified;
      setItem('lastTypedTime', String(entry.lastModified));
    }

    previousDate.current = selectedDate;
  }, [selectedDate, entries, isLoading]);

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
    let entryToSave: JournalEntry | null = null;
    let dateToDelete: string | null = null;

    if (textContent.trim() === '') {
      if (isToday) {
        const entry: JournalEntry = {
          date: selectedDate,
          content: normalizedContent,
          title: existingIndex >= 0 ? currentEntries[existingIndex].title : undefined,
          startedAt: existingIndex >= 0 ? (currentEntries[existingIndex].startedAt || timestamp || now) : (timestamp || now),
          lastModified: now,
        };
        entryToSave = entry;
        if (existingIndex >= 0) {
          newEntries = [...currentEntries];
          newEntries[existingIndex] = entry;
        } else {
          newEntries = [...currentEntries, entry];
        }
      } else {
        // Delete entry for non-today with empty content
        dateToDelete = selectedDate;
        newEntries = currentEntries.filter(e => e.date !== selectedDate);
        logAction('journal.entryDeleted', { date: selectedDate });
      }
    } else if (existingIndex >= 0) {
      const entry: JournalEntry = {
        date: selectedDate,
        content,
        title: currentEntries[existingIndex].title,
        startedAt: currentEntries[existingIndex].startedAt || timestamp || now,
        lastModified: now,
      };
      entryToSave = entry;
      newEntries = [...currentEntries];
      newEntries[existingIndex] = entry;
    } else {
      const entry: JournalEntry = {
        date: selectedDate,
        content,
        startedAt: timestamp || now,
        lastModified: now,
      };
      entryToSave = entry;
      newEntries = [...currentEntries, entry];
    }

    newEntries.sort((a, b) => b.date.localeCompare(a.date));

    // Save only the changed entry to IndexedDB (safe for multi-tab)
    if (entryToSave) {
      saveSingleEntry(entryToSave);
    } else if (dateToDelete) {
      deleteSingleEntry(dateToDelete);
    }

    // Update ref immediately too
    entriesRef.current = newEntries;

    // Clear pending save since we just saved
    pendingSaveRef.current = null;

    // Update React state (can be batched, but IndexedDB already has the data)
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
      const updatedEntry = {
        ...newEntries[existingIndex],
        title: title.trim() || undefined, // Remove title if empty
        lastModified: Date.now(), // Update timestamp so merge prefers this version
      };
      newEntries[existingIndex] = updatedEntry;

      // Save only the changed entry (safe for multi-tab)
      saveSingleEntry(updatedEntry);
      entriesRef.current = newEntries;
      return newEntries;
    });
  }, []);

  // Reload entries from storage (used after unlock)
  const reloadEntries = useCallback(async () => {
    const loadedEntries = await initJournalStorage();
    setEntries(loadedEntries);
    entriesRef.current = loadedEntries;

    const entry = loadedEntries.find((e: JournalEntry) => e.date === selectedDate);
    const content = entry?.content || '';
    setCurrentContent(content);
    return content;
  }, [selectedDate]);

  return {
    entries,
    selectedDate,
    currentContent,
    isLoading,
    setEntries,
    setSelectedDate,
    setCurrentContent,
    saveEntry,
    saveTitle,
    reloadEntries,
    lastTypedTime,
  };
}

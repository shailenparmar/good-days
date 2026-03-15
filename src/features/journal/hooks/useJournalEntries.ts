import { useState, useEffect, useRef, useCallback } from 'react';
import { getItem, setItem } from '@shared/storage';
import { initJournalStorage, saveSingleEntry, deleteSingleEntry, flushPendingSaves, onEntrySaved, loadSingleEntry, hasDecryptionFailure, cancelPendingSave } from '@shared/storage/journalStorage';
import { getTodayDate } from '@shared/utils/date';
import { htmlToText } from '@shared/utils/html';
import { logAction } from '@shared/logger';
import type { JournalEntry } from '../types';

export function useJournalEntries(encryptionKeyReady: boolean = false) {
  // Start with empty entries - will be loaded async from IndexedDB
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDateState] = useState<string>(() => {
    // Restore last viewed date, or default to today
    const saved = getItem('selectedDate');
    return saved || getTodayDate();
  });
  const [currentContent, setCurrentContent] = useState<string>('');
  const [externalContentVersion, setExternalContentVersion] = useState(0);

  const previousDate = useRef<string | null>(null);
  const lastTypedTime = useRef<number>(
    (() => {
      const saved = getItem('lastTypedTime');
      return saved ? Number(saved) : Date.now();
    })()
  );

  // Track latest state in refs (saveEntry needs synchronous access, not stale closure)
  const entriesRef = useRef<JournalEntry[]>(entries);
  const pendingSaveRef = useRef<{ content: string; date: string } | null>(null);

  // Keep entriesRef in sync
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Load entries from IndexedDB once encryption key is ready
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!encryptionKeyReady || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

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
  }, [encryptionKeyReady]); // Run when encryption key becomes ready

  // Flush debounced saves before tab closes (best-effort, async)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      flushPendingSaves();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Listen for saves from other tabs (multi-tab sync)
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  useEffect(() => {
    const unsubscribe = onEntrySaved(async (date: string) => {
      // Another tab saved this date - cancel any stale local debounced save
      // to prevent our old content from overwriting the other tab's newer save
      cancelPendingSave(date);

      // Reload from storage
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

      // If we're viewing this date, update the displayed content + signal editor to reload
      if (selectedDateRef.current === date) {
        setCurrentContent(htmlToText(entry.content || ''));
        setExternalContentVersion(v => v + 1);
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
      // If today's entry failed to decrypt, do NOT create an empty placeholder —
      // that would overwrite the encrypted data in IndexedDB with empty content.
      if (hasDecryptionFailure(today)) {
        logAction('journal.ensureToday.skipped', { reason: 'decryptionFailure', date: today });
        return;
      }

      const newTodayEntry: JournalEntry = {
        date: today,
        content: '',
      };
      const newEntries = [...entries, newTodayEntry].sort((a, b) => b.date.localeCompare(a.date));

      entriesRef.current = newEntries;
      setEntries(newEntries);
      // Don't persist the empty placeholder to IndexedDB — it's only needed in memory
      // for the sidebar. When the user types, saveEntry() will persist it.
      // This prevents overwriting existing encrypted data that we couldn't decrypt.
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
  // IMPORTANT: Updates entriesRef eagerly (not inside setEntries callback) so that
  // a debounced saveEntry() that reads entriesRef.current will see the title immediately.
  // Previously the ref update was deferred inside setEntries, creating a race where
  // saveEntry could overwrite the title with undefined.
  const saveTitle = useCallback((date: string, title: string) => {
    const currentEntries = entriesRef.current;
    const existingIndex = currentEntries.findIndex(e => e.date === date);
    const now = Date.now();
    let newEntries: JournalEntry[];
    let updatedEntry: JournalEntry;

    if (existingIndex >= 0) {
      const existing = currentEntries[existingIndex];
      const trimmedTitle = title.trim() || undefined;

      // Don't persist a blank entry (no content, no title) — it's just the in-memory placeholder
      if (!existing.content && !trimmedTitle) return;

      newEntries = [...currentEntries];
      updatedEntry = {
        ...existing,
        title: trimmedTitle,
        startedAt: existing.startedAt || now,
        lastModified: now,
      };
      newEntries[existingIndex] = updatedEntry;
    } else {
      // Entry doesn't exist yet — don't create one for an empty title
      const trimmedTitle = title.trim() || undefined;
      if (!trimmedTitle) return;

      updatedEntry = {
        date,
        content: '',
        title: trimmedTitle,
        startedAt: now,
        lastModified: now,
      };
      newEntries = [...currentEntries, updatedEntry].sort((a, b) => b.date.localeCompare(a.date));
    }

    // Save only the changed entry (safe for multi-tab)
    saveSingleEntry(updatedEntry);
    // Update ref BEFORE React state so saveEntry() sees the title immediately
    entriesRef.current = newEntries;
    setEntries(newEntries);
  }, []);

  // Reload entries from storage (used after unlock)
  const reloadEntries = useCallback(async () => {
    const loadedEntries = await initJournalStorage();
    setEntries(loadedEntries);
    entriesRef.current = loadedEntries;

    const entry = loadedEntries.find((e: JournalEntry) => e.date === selectedDate);
    const content = entry?.content || '';
    setCurrentContent(htmlToText(content));
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
    externalContentVersion,
  };
}

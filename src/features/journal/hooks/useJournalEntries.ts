import { useState, useEffect, useRef, useCallback } from 'react';
import { getItem, setItem } from '@shared/storage';
import { loadEntryIndex, saveSingleEntry, deleteSingleEntry, flushPendingSaves, onEntrySaved, loadSingleEntry, hasDecryptionFailure, cancelPendingSave } from '@shared/storage/journalStorage';
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

  // Dates whose content has been fully decrypted (or are plaintext legacy).
  // Index-only entries are NOT in this set — saveEntry refuses to overwrite
  // them, and the selectedDate effect lazy-decrypts on demand.
  const loadedDatesRef = useRef<Set<string>>(new Set());

  // React-visible mirror of loadedDatesRef so JournalEditor can distinguish
  // an index-only stub (empty content placeholder) from a real decrypted
  // entry. Without this, the editor marks an undecrypted entry as "loaded"
  // against the empty stub, then ignores the later Phase B decrypt — the
  // editor stays blank until the user navigates away and back.
  const [decryptedDates, setDecryptedDates] = useState<Set<string>>(new Set());
  const markDecrypted = useCallback((dates: string[]) => {
    if (dates.length === 0) return;
    for (const d of dates) loadedDatesRef.current.add(d);
    setDecryptedDates(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const d of dates) if (!next.has(d)) { next.add(d); changed = true; }
      return changed ? next : prev;
    });
  }, []);

  // Background prefetch token — bumped to cancel any in-flight prefetch
  // (e.g. on unmount or when a new reloadEntries supersedes the old one).
  const prefetchTokenRef = useRef<number>(0);

  // Phase C — background prefetch the remaining encrypted entries in
  // parallel batches so the sidebar populates titles without the user
  // needing to click through each entry. Uses requestIdleCallback to
  // avoid stealing main-thread time from typing/scrolling.
  const prefetchRemainingEntries = useCallback((encryptedDates: Set<string>) => {
    const BATCH_SIZE = 8;
    const token = ++prefetchTokenRef.current;
    const queue = Array.from(encryptedDates).filter(d => !loadedDatesRef.current.has(d));
    if (queue.length === 0) return;

    const startedAt = performance.now();
    let decrypted = 0;
    logAction('journal.prefetch.start', { count: queue.length, batchSize: BATCH_SIZE });

    const idle = (cb: () => void) => {
      const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(cb, { timeout: 1000 });
      else setTimeout(cb, 0);
    };

    const runBatch = () => {
      if (token !== prefetchTokenRef.current) return;
      const batch: string[] = [];
      while (batch.length < BATCH_SIZE && queue.length > 0) {
        const d = queue.shift()!;
        if (!loadedDatesRef.current.has(d)) batch.push(d);
      }
      if (batch.length === 0) {
        logAction('journal.prefetch.complete', { decrypted, total: encryptedDates.size, durationMs: Math.round(performance.now() - startedAt) });
        return;
      }

      Promise.all(batch.map(d => loadSingleEntry(d))).then(results => {
        if (token !== prefetchTokenRef.current) return;
        const fresh = results.filter((e): e is JournalEntry => !!e);
        if (fresh.length > 0) {
          markDecrypted(fresh.map(e => e.date));
          decrypted += fresh.length;
          setEntries(prev => {
            const updated = [...prev];
            for (const entry of fresh) {
              const idx = updated.findIndex(e => e.date === entry.date);
              if (idx >= 0) updated[idx] = entry;
              else updated.push(entry);
            }
            updated.sort((a, b) => b.date.localeCompare(a.date));
            entriesRef.current = updated;
            return updated;
          });
        }
        if (queue.length > 0) idle(runBatch);
        else logAction('journal.prefetch.complete', { decrypted, total: encryptedDates.size, durationMs: Math.round(performance.now() - startedAt) });
      });
    };

    idle(runBatch);
  }, []);

  // Keep entriesRef in sync
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Load entries from IndexedDB once encryption key is ready.
  // Two-phase load: (A) index-only — sidebar usable in <100ms regardless of
  // entry count; (B) decrypt today + selectedDate so the editor is writable.
  // Other entries lazy-decrypt when the user navigates to them.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!encryptionKeyReady || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let mounted = true;
    const startedAt = performance.now();

    (async () => {
      // Phase A — index only, no AES-GCM
      const { entries: indexEntries, encryptedDates } = await loadEntryIndex();
      if (!mounted) return;
      const plaintextDates = indexEntries.filter(e => !encryptedDates.has(e.date)).map(e => e.date);
      markDecrypted(plaintextDates);
      entriesRef.current = indexEntries;
      setEntries(indexEntries);
      setIsLoading(false);
      const indexMs = Math.round(performance.now() - startedAt);
      logAction('journal.index.loaded', { entryCount: indexEntries.length, encryptedCount: encryptedDates.size, durationMs: indexMs });

      // Phase B — decrypt the dates the user can immediately interact with
      const today = getTodayDate();
      const datesToDecrypt = Array.from(new Set([today, selectedDate])).filter(d => encryptedDates.has(d));
      if (datesToDecrypt.length === 0) {
        const entry = indexEntries.find(e => e.date === selectedDate);
        setCurrentContent(htmlToText(entry?.content || ''));
        logAction('journal.loaded', { entryCount: indexEntries.length, durationMs: Math.round(performance.now() - startedAt) });
        prefetchRemainingEntries(encryptedDates);
        return;
      }

      const fullEntries = await Promise.all(datesToDecrypt.map(d => loadSingleEntry(d)));
      if (!mounted) return;

      markDecrypted(fullEntries.filter((e): e is JournalEntry => !!e).map(e => e.date));
      setEntries(prev => {
        const updated = [...prev];
        for (const entry of fullEntries) {
          if (!entry) continue;
          const idx = updated.findIndex(e => e.date === entry.date);
          if (idx >= 0) updated[idx] = entry;
          else updated.push(entry);
        }
        updated.sort((a, b) => b.date.localeCompare(a.date));
        entriesRef.current = updated;
        return updated;
      });

      const selectedFull = fullEntries.find(e => e?.date === selectedDate);
      const selectedFromIndex = indexEntries.find(e => e.date === selectedDate);
      setCurrentContent(htmlToText(selectedFull?.content ?? selectedFromIndex?.content ?? ''));
      logAction('journal.loaded', { entryCount: indexEntries.length, durationMs: Math.round(performance.now() - startedAt) });
      prefetchRemainingEntries(encryptedDates);
    })();

    return () => {
      mounted = false;
      prefetchTokenRef.current++;
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

      markDecrypted([date]);
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

    if (!todayEntry) {
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

      // The placeholder is brand new — it has no ciphertext to clobber, so
      // mark it as loaded immediately or saveEntry's guard would drop the
      // user's first keystroke on a fresh day.
      markDecrypted([today]);
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

  // Handle date changes - update currentContent and lastTypedTime.
  // For index-only entries, lazy-decrypt before showing content so the user
  // doesn't see an empty editor that would then overwrite encrypted data on
  // first keystroke.
  useEffect(() => {
    if (isLoading) return;

    const isDateSwitch = previousDate.current !== null && previousDate.current !== selectedDate;
    const entry = entries.find(e => e.date === selectedDate);

    if (entry && !loadedDatesRef.current.has(selectedDate)) {
      let cancelled = false;
      (async () => {
        const t0 = performance.now();
        const fullEntry = await loadSingleEntry(selectedDate);
        if (cancelled) return;
        if (fullEntry) {
          markDecrypted([fullEntry.date]);
          setEntries(prev => {
            const idx = prev.findIndex(e => e.date === fullEntry.date);
            if (idx < 0) return prev;
            const updated = [...prev];
            updated[idx] = fullEntry;
            entriesRef.current = updated;
            return updated;
          });
          setCurrentContent(htmlToText(fullEntry.content || ''));
          if (fullEntry.lastModified && isDateSwitch) {
            lastTypedTime.current = fullEntry.lastModified;
            setItem('lastTypedTime', String(fullEntry.lastModified));
          }
          logAction('journal.entry.lazyLoaded', { date: selectedDate, durationMs: Math.round(performance.now() - t0) });
        } else {
          // Decrypt failed — don't overwrite, surface as empty
          setCurrentContent('');
        }
      })();
      previousDate.current = selectedDate;
      return () => { cancelled = true; };
    }

    setCurrentContent(htmlToText(entry?.content || ''));
    if (entry && entry.lastModified && isDateSwitch) {
      lastTypedTime.current = entry.lastModified;
      setItem('lastTypedTime', String(entry.lastModified));
    }
    previousDate.current = selectedDate;
  }, [selectedDate, entries, isLoading]);

  // Save content.
  // `targetDate` lets callers write to an explicit day instead of the
  // closure-captured `selectedDate`. The midnight rollover MUST use this:
  // setSelectedDate(today) is async/batched, so for a tick after midnight the
  // closure here still points at yesterday while the editor is mid-transition.
  // Without an explicit target, a save fired in that window lands on (and, when
  // the cleared textarea is empty, DELETES) yesterday's entry. See
  // useMidnightTimer.rollToToday.
  const saveEntry = useCallback((content: string, timestamp?: number, targetDate?: string) => {
    const date = targetDate ?? selectedDate;
    // Refuse to overwrite an entry whose ciphertext we haven't decrypted yet.
    // The selectedDate effect lazy-decrypts on navigation, so this only fires
    // during a narrow window — but it's the difference between "user types
    // before decrypt finishes and silently nukes their old entry" and "save
    // is dropped for a few hundred ms until lazy load completes".
    if (!loadedDatesRef.current.has(date)) {
      logAction('journal.save.skipped', { reason: 'entryNotLoaded', date });
      return;
    }
    const now = Date.now();

    // Get text content from HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const textContent = tempDiv.textContent || '';

    // Normalize content: if no actual text, save empty string (not <br> or other empty HTML)
    const normalizedContent = textContent.trim() === '' ? '' : content;

    const isToday = date === getTodayDate();

    // Build new entries using ref (synchronous, not affected by React batching)
    const currentEntries = entriesRef.current;
    const existingIndex = currentEntries.findIndex(e => e.date === date);
    let newEntries: JournalEntry[];
    let entryToSave: JournalEntry | null = null;
    let dateToDelete: string | null = null;

    if (textContent.trim() === '') {
      if (isToday) {
        const entry: JournalEntry = {
          date,
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
        dateToDelete = date;
        newEntries = currentEntries.filter(e => e.date !== date);
        logAction('journal.entryDeleted', { date });
      }
    } else if (existingIndex >= 0) {
      const entry: JournalEntry = {
        date,
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
        date,
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
    // If an entry already exists in the index but its ciphertext hasn't been
    // decrypted, refuse — saveTitle spreads ...existing which has content=''
    // and would wipe the original. (Brand-new entries have no ciphertext yet,
    // so the check only applies when existingIndex >= 0.)
    if (existingIndex >= 0 && !loadedDatesRef.current.has(date)) {
      logAction('journal.saveTitle.skipped', { reason: 'entryNotLoaded', date });
      return;
    }
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
    markDecrypted([date]);
    // Update ref BEFORE React state so saveEntry() sees the title immediately
    entriesRef.current = newEntries;
    setEntries(newEntries);
  }, []);

  // Reload entries from storage (used after re-lock + unlock).
  // Mirrors the two-phase load: index first, then decrypt today + selectedDate.
  const reloadEntries = useCallback(async () => {
    prefetchTokenRef.current++;
    loadedDatesRef.current.clear();
    setDecryptedDates(new Set());

    const { entries: indexEntries, encryptedDates } = await loadEntryIndex();
    const plaintextDates = indexEntries.filter(e => !encryptedDates.has(e.date)).map(e => e.date);
    markDecrypted(plaintextDates);
    entriesRef.current = indexEntries;
    setEntries(indexEntries);

    const today = getTodayDate();
    const datesToDecrypt = Array.from(new Set([today, selectedDate])).filter(d => encryptedDates.has(d));
    const fullEntries = await Promise.all(datesToDecrypt.map(d => loadSingleEntry(d)));

    if (fullEntries.length > 0) {
      markDecrypted(fullEntries.filter((e): e is JournalEntry => !!e).map(e => e.date));
      setEntries(prev => {
        const updated = [...prev];
        for (const entry of fullEntries) {
          if (!entry) continue;
          const idx = updated.findIndex(e => e.date === entry.date);
          if (idx >= 0) updated[idx] = entry;
          else updated.push(entry);
        }
        updated.sort((a, b) => b.date.localeCompare(a.date));
        entriesRef.current = updated;
        return updated;
      });
    }

    const selectedFull = fullEntries.find(e => e?.date === selectedDate);
    const selectedFromIndex = indexEntries.find(e => e.date === selectedDate);
    const content = selectedFull?.content ?? selectedFromIndex?.content ?? '';
    setCurrentContent(htmlToText(content));
    prefetchRemainingEntries(encryptedDates);
    return content;
  }, [selectedDate, prefetchRemainingEntries, markDecrypted]);

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
    decryptedDates,
  };
}

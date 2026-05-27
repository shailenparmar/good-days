import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { flushPendingSaves } from '@shared/storage/journalStorage';
import { getTodayDate } from '@shared/utils/date';
import { logAction } from '@shared/logger';

/**
 * Automatic midnight detection - saves current entry and switches to new day.
 * Uses refs to avoid stale closures.
 */
export function useMidnightTimer(
  editorRef: React.RefObject<HTMLTextAreaElement | null>,
  journalRef: React.MutableRefObject<{ saveEntry: (content: string, timestamp: number, targetDate?: string) => void; setSelectedDate: (date: string) => void; selectedDate: string }>,
) {
  const midnightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const rollToToday = () => {
      // The day we're rolling AWAY from. Capture it now so the save is pinned
      // to it explicitly — setSelectedDate below is async, so saveEntry's own
      // closure would still read this date for a tick after the switch, and
      // any keystroke in that window would clobber (or, if empty, delete) it.
      const fromDate = journalRef.current.selectedDate;
      if (editorRef.current) {
        const content = editorRef.current.value || '';
        if (content.trim()) {
          journalRef.current.saveEntry(content, Date.now(), fromDate);
        }
      }
      flushPendingSaves();
      // Commit the day switch synchronously. flushSync forces React to render +
      // run effects (so journalRef updates to today) before the next keystroke
      // event is processed — closing the window where typing across midnight
      // would still be routed to yesterday's entry.
      flushSync(() => {
        journalRef.current.setSelectedDate(getTodayDate());
      });
      if (editorRef.current) {
        editorRef.current.value = '';
      }
    };

    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      midnightTimeoutRef.current = setTimeout(() => {
        logAction('app.midnight');
        rollToToday();
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    // Catch missed midnights (sleep, tab suspend, etc.)
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const today = getTodayDate();
      if (journalRef.current.selectedDate !== today) {
        logAction('app.midnight.visibility');
        rollToToday();
        // Reschedule — the old timeout is stale after a missed midnight
        if (midnightTimeoutRef.current) clearTimeout(midnightTimeoutRef.current);
        scheduleNextMidnight();
      }
    };

    scheduleNextMidnight();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (midnightTimeoutRef.current) {
        clearTimeout(midnightTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []); // Empty deps - uses refs for latest values
}

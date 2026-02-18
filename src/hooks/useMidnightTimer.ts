import { useEffect, useRef } from 'react';
import { flushPendingSaves } from '@shared/storage/journalStorage';
import { getTodayDate } from '@shared/utils/date';
import { logAction } from '@shared/logger';

/**
 * Automatic midnight detection - saves current entry and switches to new day.
 * Uses refs to avoid stale closures.
 */
export function useMidnightTimer(
  editorRef: React.RefObject<HTMLTextAreaElement | null>,
  journalRef: React.MutableRefObject<{ saveEntry: (content: string, timestamp: number) => void; setSelectedDate: (date: string) => void; selectedDate: string }>,
) {
  const midnightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const rollToToday = () => {
      if (editorRef.current) {
        const content = editorRef.current.value || '';
        if (content.trim()) {
          journalRef.current.saveEntry(content, Date.now());
        }
      }
      flushPendingSaves();
      journalRef.current.setSelectedDate(getTodayDate());
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

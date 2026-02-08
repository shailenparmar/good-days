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
  journalRef: React.MutableRefObject<{ saveEntry: (content: string, timestamp: number) => void; setSelectedDate: (date: string) => void }>,
) {
  const midnightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      midnightTimeoutRef.current = setTimeout(() => {
        logAction('app.midnight');
        // Save current content using ref to get latest journal
        if (editorRef.current) {
          const content = editorRef.current.value || '';
          if (content.trim()) {
            journalRef.current.saveEntry(content, Date.now());
          }
        }
        // Flush debounced saves immediately (don't wait 300ms)
        flushPendingSaves();
        // Switch to new day
        journalRef.current.setSelectedDate(getTodayDate());
        if (editorRef.current) {
          editorRef.current.value = '';
        }
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    scheduleNextMidnight();
    return () => {
      if (midnightTimeoutRef.current) {
        clearTimeout(midnightTimeoutRef.current);
      }
    };
  }, []); // Empty deps - uses refs for latest values
}

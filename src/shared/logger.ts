// Lightweight action logger for debugging user-reported issues
// Stores a circular buffer of events in localStorage (never logs entry content)

export interface LogEntry {
  t: number;                         // timestamp (Date.now())
  e: string;                         // event name, e.g. 'storage.save'
  d?: Record<string, unknown>;       // optional metadata (NEVER content)
}

const STORAGE_KEY = 'gdays_actionLog';
const MAX_ENTRIES = 500;

function readLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Log a user action. Writes immediately to localStorage. */
export function logAction(event: string, data?: Record<string, unknown>): void {
  try {
    const logs = readLogs();
    logs.push({ t: Date.now(), e: event, d: data });
    while (logs.length > MAX_ENTRIES) {
      logs.shift();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Storage full or unavailable — silently fail, never break the app
  }
}

/** Export logs as a formatted human-readable string. */
export function exportLogs(appVersion: string, entryCount: number): string {
  const logs = readLogs();
  const header = [
    'good days debug log',
    `exported: ${new Date().toISOString()}`,
    `app version: ${appVersion}`,
    `entries in storage: ${entryCount}`,
    `log events: ${logs.length}`,
    `user agent: ${navigator.userAgent}`,
    '---',
    '',
  ].join('\n');

  const lines = logs.map(entry => {
    const time = new Date(entry.t).toISOString();
    const data = entry.d ? ` ${JSON.stringify(entry.d)}` : '';
    return `[${time}] ${entry.e}${data}`;
  });

  return header + lines.join('\n');
}

/** Clear all logs. */
export function clearLogs(): void {
  localStorage.removeItem(STORAGE_KEY);
}

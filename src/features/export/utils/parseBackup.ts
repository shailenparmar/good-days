import type { JournalEntry } from '@features/journal';
import type { ColorPreset } from '@features/theme';
import type { BackupV1, BackupV2, BackupV3 } from './formatEntries';
import type { WrappedDEKData } from '@shared/storage/journalStorage';
import { htmlToText } from '@shared/utils/html';

interface ParsedEntry {
  date: string;
  content: string;
  startedAt?: number;
}

export interface ParsedBackup {
  entries: JournalEntry[];
  presets: ColorPreset[] | null;
  customPresets: ColorPreset[] | null;
}

// v3 backup envelope — payload is encrypted, needs DEK to decrypt
export interface ParsedBackupV3 {
  version: 3;
  dek: WrappedDEKData;
  payload: string;  // encrypted BackupV3Payload (base64 AES-GCM ciphertext)
}

// Try to parse as JSON backup (v1+), returns null if not JSON format
// For v3, returns a ParsedBackupV3 (entries not yet decrypted)
export function parseBackupJson(text: string): ParsedBackup | ParsedBackupV3 | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.version !== 'number') return null;

    // v3: DEK/KEK encrypted payload
    if (parsed.version === 3 && parsed.dek && typeof parsed.payload === 'string') {
      const backup = parsed as BackupV3;
      return {
        version: 3,
        dek: backup.dek,
        payload: backup.payload,
      };
    }

    // v1/v2: plaintext entries (after outer decryption)
    if (Array.isArray(parsed.entries)) {
      if (parsed.version >= 2) {
        const backup = parsed as BackupV2;
        return {
          entries: backup.entries,
          presets: backup.presets ?? null,
          customPresets: backup.customPresets ?? null,
        };
      }
      // v1 backup - no presets
      const backup = parsed as BackupV1;
      return { entries: backup.entries, presets: null, customPresets: null };
    }
    return null;
  } catch {
    return null;
  }
}

// Type guard: check if parsed backup is v3 (needs DEK decryption)
export function isV3Backup(backup: ParsedBackup | ParsedBackupV3): backup is ParsedBackupV3 {
  return 'version' in backup && backup.version === 3;
}

// Merge JSON-imported entries (already have HTML content) with existing entries
export function mergeJsonEntries(
  existingEntries: JournalEntry[],
  importedEntries: JournalEntry[],
  importTimestamp: number
): MergeResult {
  const result = [...existingEntries];
  const existingDates = new Set(existingEntries.map(e => e.date));
  let importedCount = 0;

  for (const imported of importedEntries) {
    if (existingDates.has(imported.date)) {
      // Conflict: date already exists
      const existingIndex = result.findIndex(e => e.date === imported.date);
      const existing = result[existingIndex];

      // Compare entries as units (title + content)
      const existingText = htmlToText(existing.content).trim();
      const importedText = htmlToText(imported.content).trim();

      const existingNormalized = normalizeForComparison(existingText);
      const importedNormalized = normalizeForComparison(importedText);
      const titlesMatch = (existing.title || '') === (imported.title || '');

      // Duplicate detection: check for [from backup] marker + title/content
      const hasImportMarker = existingNormalized.includes('[from backup]');
      const hasImportedContent = existingNormalized.includes(importedNormalized);
      const hasImportedTitle = imported.title
        ? existingNormalized.includes(`title: ${normalizeForComparison(imported.title)}`)
        : true;
      const alreadyAppended = hasImportMarker && hasImportedContent && hasImportedTitle;

      // Skip if: empty import, exact match (same content + title), or already appended
      if (
        importedNormalized === '' ||
        (existingNormalized === importedNormalized && titlesMatch) ||
        alreadyAppended
      ) {
        // no-op: nothing new to import
      } else {
        // Different entry - append as a unit with separator
        const metaParts: string[] = [];
        if (imported.startedAt) metaParts.push(formatStartedAt(imported.startedAt));
        if (imported.title) metaParts.push(`title: ${imported.title}`);
        const metaBlock = metaParts.length > 0 ? '\n' + metaParts.join('\n') : '';
        const separator = `\n\n--- [from backup] ---${metaBlock}\n\n`;

        result[existingIndex] = {
          ...existing,
          content: existing.content + separator + imported.content,
          title: existing.title || imported.title,
          startedAt: imported.startedAt && (!existing.startedAt || imported.startedAt < existing.startedAt)
            ? imported.startedAt
            : existing.startedAt,
          lastModified: importTimestamp,
        };
        importedCount++;
      }
    } else {
      // No conflict - add as new entry (preserve original lastModified)
      result.push({
        ...imported,
        lastModified: imported.lastModified || importTimestamp,
      });
      existingDates.add(imported.date);
      importedCount++;
    }
  }

  // Sort by date descending (newest first)
  result.sort((a, b) => b.date.localeCompare(a.date));

  return { entries: result, importedCount };
}

// Legacy: Parse a backup TXT file back into journal entries
export function parseBackupText(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  // Split by date headers (## Day, Month Date, Year)
  // Strict pattern to avoid matching user content that starts with "## "
  const dateHeaderRegex = /^## ([A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4})$/gm;
  const parts = text.split(dateHeaderRegex);

  // parts[0] is the header before first date
  // parts[1] is first date string, parts[2] is first content
  // parts[3] is second date string, parts[4] is second content, etc.

  for (let i = 1; i < parts.length; i += 2) {
    const dateString = parts[i]?.trim();
    const content = parts[i + 1]?.trim() || '';

    if (!dateString) continue;

    // Parse the date string (e.g., "Monday, January 27, 2025")
    const parsedDate = parseEnglishDate(dateString);
    if (!parsedDate) continue;

    // Extract startedAt time if present
    let startedAt: number | undefined;
    let cleanContent = content;

    const startedAtMatch = content.match(/^\*Started at (\d{2}):(\d{2}):(\d{2})\*\n*/);
    if (startedAtMatch) {
      const [fullMatch, hours, minutes, seconds] = startedAtMatch;
      const date = new Date(parsedDate + 'T00:00:00');
      date.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10));
      startedAt = date.getTime();
      cleanContent = content.slice(fullMatch.length).trim();
    }

    entries.push({
      date: parsedDate,
      content: cleanContent,
      startedAt,
    });
  }

  return entries;
}

// Parse English date format to YYYY-MM-DD
function parseEnglishDate(dateStr: string): string | null {
  // Handle format: "Monday, January 27, 2025"
  const months: Record<string, number> = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };

  // Remove day name if present
  const withoutDay = dateStr.replace(/^[a-z]+,\s*/i, '');

  // Match "Month Day, Year"
  const match = withoutDay.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (!match) return null;

  const [, monthName, day, year] = match;
  const month = months[monthName.toLowerCase()];
  if (month === undefined) return null;

  const dayNum = parseInt(day, 10);
  const yearNum = parseInt(year, 10);

  // Format as YYYY-MM-DD
  return `${yearNum}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

export interface MergeResult {
  entries: JournalEntry[];
  importedCount: number;
}

// Merge imported entries with existing entries
export function mergeEntries(
  existingEntries: JournalEntry[],
  importedEntries: ParsedEntry[],
  importTimestamp: number
): MergeResult {
  const result = [...existingEntries];
  const existingDates = new Set(existingEntries.map(e => e.date));
  let importedCount = 0;

  for (const imported of importedEntries) {
    if (existingDates.has(imported.date)) {
      // Conflict: date already exists
      // Find the existing entry
      const existingIndex = result.findIndex(e => e.date === imported.date);
      const existing = result[existingIndex];

      // Compare content
      const existingText = htmlToText(existing.content).trim();
      const importedText = imported.content.trim();

      const existingNormalized = normalizeForComparison(existingText);
      const importedNormalized = normalizeForComparison(importedText);

      // Duplicate detection: check for [from backup] marker + content
      const alreadyAppended = existingNormalized.includes('[from backup]') &&
        existingNormalized.includes(importedNormalized);

      // Skip if: empty import, exact match, or already appended
      if (
        importedNormalized === '' ||
        existingNormalized === importedNormalized ||
        alreadyAppended
      ) {
        // no-op: nothing new to import
      } else {
        // Different content - append with separator
        const startedAtLine = imported.startedAt ? '\n' + formatStartedAt(imported.startedAt) : '';
        const separator = `\n\n--- [from backup] ---${startedAtLine}\n\n`;

        // Convert imported plain text to HTML (preserve line breaks)
        const importedHtml = imported.content
          .split('\n')
          .map(line => `<div>${line || '<br>'}</div>`)
          .join('');

        result[existingIndex] = {
          ...existing,
          content: existing.content + separator + importedHtml,
          startedAt: imported.startedAt && (!existing.startedAt || imported.startedAt < existing.startedAt)
            ? imported.startedAt
            : existing.startedAt,
          lastModified: importTimestamp,
        };
        importedCount++;
      }
    } else {
      // No conflict - add as new entry
      const importedHtml = imported.content
        .split('\n')
        .map(line => `<div>${line || '<br>'}</div>`)
        .join('');

      result.push({
        date: imported.date,
        content: importedHtml,
        startedAt: imported.startedAt || importTimestamp,
        lastModified: importTimestamp, // Legacy format has no lastModified, so import time is best we can do
      });
      existingDates.add(imported.date);
      importedCount++;
    }
  }

  // Sort by date descending (newest first)
  result.sort((a, b) => b.date.localeCompare(a.date));

  return { entries: result, importedCount };
}

// Normalize text for comparison (collapse all whitespace)
function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Format startedAt timestamp for merge separator (e.g., "started at 10:28 pm")
function formatStartedAt(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h = hours % 12 || 12;
  return `started at ${h}:${minutes} ${ampm}`;
}


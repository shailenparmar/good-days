import type { JournalEntry } from '@features/journal';

interface ParsedEntry {
  date: string;
  content: string;
  startedAt?: number;
}

// Parse a backup TXT file back into journal entries
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

      // Check if content is actually different and not already contained
      const existingText = stripHtml(existing.content).trim();
      const importedText = imported.content.trim();

      // Normalize for comparison (collapse whitespace differences from HTML conversion)
      const existingNormalized = normalizeForComparison(existingText);
      const importedNormalized = normalizeForComparison(importedText);

      // Skip if: same content, empty import, or existing already contains imported text
      if (existingNormalized !== importedNormalized && importedNormalized !== '' && !existingNormalized.includes(importedNormalized)) {
        // Different content - append imported content with label above it
        const importDate = new Date(importTimestamp);
        const importLabel = `\n\n---\nfrom ${importDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit'
        })} backup:\n\n`;

        // Convert imported plain text to HTML (preserve line breaks)
        const importedHtml = imported.content
          .split('\n')
          .map(line => `<div>${line || '<br>'}</div>`)
          .join('');

        result[existingIndex] = {
          ...existing,
          content: existing.content + importLabel + importedHtml,
          // Update startedAt if imported entry is older
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
        lastModified: importTimestamp,
      });
      existingDates.add(imported.date);
      importedCount++;
    }
  }

  // Sort by date descending (newest first)
  result.sort((a, b) => b.date.localeCompare(a.date));

  return { entries: result, importedCount };
}

// Strip HTML tags to get plain text
function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

// Normalize text for comparison (collapse all whitespace)
function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

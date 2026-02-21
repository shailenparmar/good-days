import type { JournalEntry } from '@features/journal';
import type { ColorPreset } from '@features/theme';
import type { EncryptedRecord, WrappedDEKData } from '@shared/storage/journalStorage';

// JSON backup format (v1)
export interface BackupV1 {
  version: 1;
  exportedAt: number;
  entries: JournalEntry[];
}

// JSON backup format (v2) - adds color presets
export interface BackupV2 {
  version: 2;
  exportedAt: number;
  entries: JournalEntry[];
  presets?: ColorPreset[];
  customPresets?: ColorPreset[];
}

// Inner payload of v3 backup (encrypted with DEK)
export interface BackupV3Payload {
  exportedAt: number;
  encryptedEntries: EncryptedRecord[];   // entries still encrypted with DEK
  presets?: ColorPreset[];
  customPresets?: ColorPreset[];
}

// JSON backup format (v3) - outer envelope (only version + wrapped DEK visible)
export interface BackupV3 {
  version: 3;
  dek: WrappedDEKData;                  // DEK wrapped with user's KEK
  payload: string;                       // base64 AES-GCM ciphertext of BackupV3Payload
}

// For encrypted backup (JSON format) — legacy v2
export function formatEntriesAsJson(
  entries: JournalEntry[],
  presets?: ColorPreset[],
  customPresets?: ColorPreset[],
): string {
  const backup: BackupV2 = {
    version: 2,
    exportedAt: Date.now(),
    entries: [...entries].sort((a, b) => a.date.localeCompare(b.date)), // oldest first
    presets,
    customPresets,
  };
  return JSON.stringify(backup);
}

// For v3 backup — entire payload encrypted with DEK (dates, presets, everything)
export async function formatV3Backup(
  encryptedEntries: EncryptedRecord[],
  wrappedDEK: WrappedDEKData,
  dek: CryptoKey,
  presets?: ColorPreset[],
  customPresets?: ColorPreset[],
): Promise<string> {
  const { encryptWithKey } = await import('@shared/crypto');

  const innerPayload: BackupV3Payload = {
    exportedAt: Date.now(),
    encryptedEntries: [...encryptedEntries].sort((a, b) => a.date.localeCompare(b.date)),
    presets,
    customPresets,
  };

  // Encrypt the entire payload with the DEK
  const encryptedPayload = await encryptWithKey(JSON.stringify(innerPayload), dek);

  const backup: BackupV3 = {
    version: 3,
    dek: wrappedDEK,
    payload: encryptedPayload,
  };
  return JSON.stringify(backup);
}

// Legacy: For encrypted backup (markdown format needed for import parsing)
export function formatEntriesAsText(entries: JournalEntry[]): string {
  if (entries.length === 0) return '';

  // Sort entries by date ascending (oldest first)
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let textContent = `# good days pro\n\n`;
  textContent += '---\n';

  sortedEntries.forEach(entry => {
    const date = new Date(entry.date + 'T00:00:00');
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    textContent += `\n## ${formattedDate}\n\n`;
    if (entry.title) {
      textContent += `**${entry.title}**\n\n`;
    }
    if (entry.startedAt) {
      const startTime = new Date(entry.startedAt);
      const hours = String(startTime.getHours()).padStart(2, '0');
      const minutes = String(startTime.getMinutes()).padStart(2, '0');
      const seconds = String(startTime.getSeconds()).padStart(2, '0');
      textContent += `*Started at ${hours}:${minutes}:${seconds}*\n\n`;
    }

    // Get text content from HTML, preserving line breaks
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = entry.content;

    // Convert <br> and block elements to newlines
    tempDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    tempDiv.querySelectorAll('div, p').forEach(div => {
      const text = div.textContent || '';
      div.replaceWith(text + '\n');
    });

    let plainText = tempDiv.textContent || '';
    // Remove excessive newlines (more than 2 in a row) and trim
    plainText = plainText.replace(/\n{3,}/g, '\n\n').trim();

    textContent += plainText + '\n\n';
  });

  return textContent;
}

// For clipboard (plain text, dense, newest first)
export function formatEntriesForClipboard(entries: JournalEntry[]): string {
  if (entries.length === 0) return '';

  // Sort entries by date descending (newest first, like the sidebar)
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const lines: string[] = [];

  sortedEntries.forEach(entry => {
    const date = new Date(entry.date + 'T00:00:00');
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    lines.push(formattedDate);
    if (entry.title) {
      lines.push(entry.title);
    }

    // Get text content from HTML, preserving line breaks
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = entry.content;

    // Convert <br> and block elements to newlines
    tempDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    tempDiv.querySelectorAll('div, p').forEach(div => {
      const text = div.textContent || '';
      div.replaceWith(text + '\n');
    });

    let plainText = tempDiv.textContent || '';
    // Normalize newlines and trim
    plainText = plainText.replace(/\n{2,}/g, '\n').trim();

    if (plainText) {
      lines.push(plainText);
    }
    lines.push(''); // Single blank line between entries
  });

  return lines.join('\n').trim();
}

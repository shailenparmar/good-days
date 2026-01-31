import { useRef } from 'react';
import { Upload, Download, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsText, formatEntriesForClipboard } from '../utils/formatEntries';
import { parseBackupText, mergeEntries } from '../utils/parseBackup';
import { encryptText, decryptText, formatEncryptedBackup, parseEncryptedBackup } from '../utils/crypto';
import { FunctionButton } from '@shared/components';
import { getItem } from '@shared/storage';
import { scrambleText } from '@shared/utils/scramble';
import { markEasterEggFound } from '@shared/utils/easterEggs';

interface ExportButtonsProps {
  entries: JournalEntry[];
  onImport: (entries: JournalEntry[]) => void;
  stacked?: boolean;
  supermode?: boolean;
  scrambleSeed?: number;
}

export function ExportButtons({ entries, onImport, stacked, supermode, scrambleSeed }: ExportButtonsProps) {
  // Suppress unused variable warning - scrambleSeed triggers re-renders
  void scrambleSeed;

  // Helper to scramble text in supermode
  const s = (text: string) => supermode ? scrambleText(text) : text;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const fileContent = event.target?.result as string;
      console.log('1. File content loaded:', fileContent?.substring(0, 100));
      if (!fileContent) return;

      // Check if this is an encrypted backup
      const encryptedContent = parseEncryptedBackup(fileContent);
      console.log('2. Encrypted content extracted:', encryptedContent?.substring(0, 50));
      if (!encryptedContent) {
        console.error('Invalid backup file: not an encrypted backup');
        return;
      }

      try {
        // Decrypt the content
        const decrypted = await decryptText(encryptedContent);
        console.log('3. Decrypted content:', decrypted?.substring(0, 200));

        // Parse the decrypted backup text
        const parsed = parseBackupText(decrypted);
        console.log('4. Parsed entries:', parsed);

        const merged = mergeEntries(entries, parsed, Date.now());
        console.log('5. Merged entries:', merged);

        onImport(merged);
        console.log('6. Import called');
      } catch (err) {
        console.error('Failed to decrypt backup:', err);
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleBackup = async () => {
    const textContent = formatEntriesAsText(entries);
    if (!textContent) return;

    try {
      // Encrypt the content
      const encrypted = await encryptText(textContent);
      const use24Hour = getItem('timeFormat') === '24h';
      const fileContent = formatEncryptedBackup(encrypted, use24Hour);

      const blob = new Blob([fileContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const dateStr = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
      a.download = `good days ${dateStr}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to encrypt backup:', err);
    }
  };

  const handleCopyToClipboard = async () => {
    // Powerstat mode: markdown format, Normal mode: plain text
    const textContent = stacked ? formatEntriesAsText(entries) : formatEntriesForClipboard(entries);
    if (!textContent) return;

    try {
      await navigator.clipboard.writeText(textContent);
      // Track easter egg when copying in powerstat mode (markdown format)
      if (stacked) {
        markEasterEggFound('copyMarkdown');
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={handleFileChange}
        className="hidden"
      />
      <FunctionButton onClick={handleCopyToClipboard} disabled={entries.length === 0} size="sm">
        <Copy className="w-3 h-3" />
        <span>{s(stacked ? 'copy markdown format' : 'copy to clipboard')}</span>
      </FunctionButton>
      <FunctionButton onClick={handleBackup} disabled={entries.length === 0} size="sm">
        <Upload className="w-3 h-3" />
        <span>{s(stacked ? 'AES encrypted backup' : 'backup')}</span>
      </FunctionButton>
      <FunctionButton onClick={handleImport} size="sm">
        <Download className="w-3 h-3" />
        <span>{s(stacked ? 'import AES encrypted backup' : 'import')}</span>
      </FunctionButton>
    </div>
  );
}

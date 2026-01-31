import { useRef } from 'react';
import { Upload, Download, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsText } from '../utils/formatEntries';
import { parseBackupText, mergeEntries } from '../utils/parseBackup';
import { encryptText, decryptText, formatEncryptedBackup, parseEncryptedBackup } from '../utils/crypto';
import { FunctionButton } from '@shared/components';
import { getItem } from '@shared/storage';

interface ExportButtonsProps {
  entries: JournalEntry[];
  onImport: (entries: JournalEntry[]) => void;
}

export function ExportButtons({ entries, onImport }: ExportButtonsProps) {
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
      if (!fileContent) return;

      // Check if this is an encrypted backup
      const encryptedContent = parseEncryptedBackup(fileContent);
      if (!encryptedContent) {
        console.error('Invalid backup file: not an encrypted backup');
        return;
      }

      try {
        // Decrypt the content
        const decrypted = await decryptText(encryptedContent);

        // Parse the decrypted backup text
        const parsed = parseBackupText(decrypted);
        const merged = mergeEntries(entries, parsed, Date.now());
        onImport(merged);
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
    const textContent = formatEntriesAsText(entries);
    if (!textContent) return;

    try {
      await navigator.clipboard.writeText(textContent);
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
        <span>copy to clipboard</span>
      </FunctionButton>
      <FunctionButton onClick={handleBackup} disabled={entries.length === 0} size="sm">
        <Upload className="w-3 h-3" />
        <span>backup</span>
      </FunctionButton>
      <FunctionButton onClick={handleImport} size="sm">
        <Download className="w-3 h-3" />
        <span>import</span>
      </FunctionButton>
    </div>
  );
}

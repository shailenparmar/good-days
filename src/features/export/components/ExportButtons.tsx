import { useRef, useState, useEffect } from 'react';
import { Upload, Download, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsText, formatEntriesForClipboard } from '../utils/formatEntries';
import { parseBackupText, mergeEntries } from '../utils/parseBackup';
import { encryptText, decryptText, formatEncryptedBackup, parseEncryptedBackup } from '../utils/crypto';
import { FunctionButton } from '@shared/components';
import { getItem } from '@shared/storage';
import { scrambleText } from '@shared/utils/scramble';
import { useTheme } from '@features/theme';

interface ExportButtonsProps {
  entries: JournalEntry[];
  onImport: (entries: JournalEntry[]) => void;
  stacked?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
}

export function ExportButtons({ entries, onImport, stacked, superscramble, scrambleSeed }: ExportButtonsProps) {
  // Suppress unused variable warning - scrambleSeed triggers re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import feedback state: success (count) or failure
  const [importFeedback, setImportFeedback] = useState<{ type: 'success'; count: number } | { type: 'error' } | null>(null);
  const [importHovered, setImportHovered] = useState(false);
  const { hue } = useTheme();
  const isThemeGreen = hue >= 80 && hue <= 160;
  const confirmColor = isThemeGreen ? '#0ffffb' : '#00ff00';
  const errorColor = '#ff0000';

  // Dismiss import feedback on click or key anywhere
  useEffect(() => {
    if (!importFeedback) return;

    const dismiss = () => setImportFeedback(null);

    // Small delay to avoid the import click from immediately dismissing
    const timer = setTimeout(() => {
      window.addEventListener('click', dismiss);
      window.addEventListener('keydown', dismiss);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', dismiss);
    };
  }, [importFeedback]);

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Helper to read a file as text
    const readFile = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    };

    let currentEntries = entries;
    let totalImported = 0;
    let hasError = false;

    // Process all files sequentially
    for (const file of Array.from(files)) {
      try {
        const fileContent = await readFile(file);
        if (!fileContent) continue;

        // Check if this is an encrypted backup
        const encryptedContent = parseEncryptedBackup(fileContent);
        if (!encryptedContent) {
          console.error(`Invalid backup file: ${file.name}`);
          hasError = true;
          continue;
        }

        // Decrypt the content
        const decrypted = await decryptText(encryptedContent);

        // Parse the decrypted backup text
        const parsed = parseBackupText(decrypted);

        // Merge into running total
        const { entries: merged, importedCount } = mergeEntries(currentEntries, parsed, Date.now());
        currentEntries = merged;
        totalImported += importedCount;
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
        hasError = true;
      }
    }

    // Update state once with final merged result
    if (totalImported > 0 || !hasError) {
      onImport(currentEntries);
      setImportFeedback({ type: 'success', count: totalImported });
    } else {
      setImportFeedback({ type: 'error' });
    }

    // Reset input so same files can be selected again
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
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <FunctionButton onClick={handleCopyToClipboard} disabled={entries.length === 0} size="sm">
        <Copy className="w-3 h-3" />
        <span>{s(stacked ? 'copy markdown format' : 'copy to clipboard')}</span>
      </FunctionButton>
      <FunctionButton onClick={handleBackup} disabled={entries.length === 0} size="sm">
        <Upload className="w-3 h-3" />
        <span>{s(stacked ? 'AES-256-GCM backup' : 'backup')}</span>
      </FunctionButton>
      <div
        onMouseEnter={() => setImportHovered(true)}
        onMouseLeave={() => setImportHovered(false)}
      >
        <FunctionButton
          onClick={importFeedback ? () => setImportFeedback(null) : handleImport}
          size="sm"
          overrideColor={importFeedback ? (importFeedback.type === 'success' ? confirmColor : errorColor) : undefined}
        >
          {!importFeedback && !importHovered && <Download className="w-3 h-3" />}
          <span>
            {importFeedback
              ? importFeedback.type === 'success'
                ? s(`${importFeedback.count} ${importFeedback.count === 1 ? 'entry' : 'entries'} imported`)
                : s('import failed')
              : stacked && importHovered
                ? s('multiple files accepted')
                : s(stacked ? 'import AES-256-GCM backup' : 'import')}
          </span>
        </FunctionButton>
      </div>
    </div>
  );
}

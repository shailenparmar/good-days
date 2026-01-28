import { useRef } from 'react';
import { Download, Upload, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsText } from '../utils/formatEntries';
import { parseBackupText, mergeEntries } from '../utils/parseBackup';
import { FunctionButton } from '@shared/components';

interface ExportButtonsProps {
  entries: JournalEntry[];
  onImport?: (mergedEntries: JournalEntry[]) => void;
}

export function ExportButtons({ entries, onImport }: ExportButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = () => {
    const textContent = formatEntriesAsText(entries);
    if (!textContent) return;

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-backup-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;

    try {
      const text = await file.text();
      const parsedEntries = parseBackupText(text);

      if (parsedEntries.length === 0) {
        alert('No entries found in backup file. Make sure it\'s a valid Good Days backup.');
        return;
      }

      const importTimestamp = Date.now();
      const mergedEntries = mergeEntries(entries, parsedEntries, importTimestamp);

      onImport(mergedEntries);
      alert(`Imported ${parsedEntries.length} entries successfully!`);
    } catch (err) {
      console.error('Failed to import backup:', err);
      alert('Failed to import backup file. Please check the file format.');
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <FunctionButton onClick={handleCopyToClipboard} disabled={entries.length === 0} size="sm">
        <Copy className="w-3 h-3" />
        <span>copy to clipboard</span>
      </FunctionButton>
      <FunctionButton onClick={handleBackup} disabled={entries.length === 0} size="sm">
        <Upload className="w-3 h-3" />
        <span>backup</span>
      </FunctionButton>
      <FunctionButton onClick={handleImportClick} size="sm">
        <Download className="w-3 h-3" />
        <span>import backup</span>
      </FunctionButton>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

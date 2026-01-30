import { Upload, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsText } from '../utils/formatEntries';
import { FunctionButton } from '@shared/components';

interface ExportButtonsProps {
  entries: JournalEntry[];
}

export function ExportButtons({ entries }: ExportButtonsProps) {
  const handleBackup = () => {
    const textContent = formatEntriesAsText(entries);
    if (!textContent) return;

    const blob = new Blob([textContent], { type: 'text/plain' });
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
      <FunctionButton onClick={handleCopyToClipboard} disabled={entries.length === 0} size="sm">
        <Copy className="w-3 h-3" />
        <span>copy to clipboard</span>
      </FunctionButton>
      <FunctionButton onClick={handleBackup} disabled={entries.length === 0} size="sm">
        <Upload className="w-3 h-3" />
        <span>backup</span>
      </FunctionButton>
    </div>
  );
}

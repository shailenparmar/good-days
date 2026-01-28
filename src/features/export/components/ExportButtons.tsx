import { useState, useEffect } from 'react';
import { Download, Copy, Laptop } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsText } from '../utils/formatEntries';
import { FunctionButton } from '@shared/components';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ExportButtonsProps {
  entries: JournalEntry[];
  onToggleInstall: () => void;
  showInstallPanel: boolean;
}

export function ExportButtons({ entries, onToggleInstall, showInstallPanel }: ExportButtonsProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Capture the beforeinstallprompt event for Chrome/Edge
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    // Chrome/Edge: trigger native install prompt
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else {
      // Safari/Firefox: show instructions panel
      onToggleInstall();
    }
  };

  const handleExport = () => {
    const textContent = formatEntriesAsText(entries);
    if (!textContent) return;

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-export-${new Date().toISOString().split('T')[0]}.txt`;
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
      <FunctionButton onClick={handleExport} disabled={entries.length === 0} size="sm">
        <Download className="w-3 h-3" />
        <span>export to txt</span>
      </FunctionButton>
      <FunctionButton onClick={handleInstallClick} isActive={showInstallPanel} size="sm">
        <Laptop className="w-3 h-3" />
        <span>install app</span>
      </FunctionButton>
    </div>
  );
}

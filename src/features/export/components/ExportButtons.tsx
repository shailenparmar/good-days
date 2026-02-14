import { useRef, useState, useEffect, useMemo } from 'react';
import { Upload, Download, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsJson, formatEntriesAsText, formatEntriesForClipboard } from '../utils/formatEntries';
import { parseBackupJson, parseBackupText, mergeJsonEntries, mergeEntries } from '../utils/parseBackup';
import { encryptText, decryptText, formatEncryptedBackup, parseEncryptedBackup } from '@shared/crypto';
import { FunctionButton } from '@shared/components';
import { useStableHover } from '@shared/hooks';
import { scrambleText } from '@shared/utils/scramble';
import { getStatusColors } from '@shared/utils/confirmColor';
import { logAction } from '@shared/logger';
import { useTheme, type ColorPreset } from '@features/theme';

function presetsEqual(a: ColorPreset, b: ColorPreset): boolean {
  return a.hue === b.hue && a.sat === b.sat && a.light === b.light &&
    a.bgHue === b.bgHue && a.bgSat === b.bgSat && a.bgLight === b.bgLight;
}

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
  const [importFeedback, setImportFeedback] = useState<{ type: 'success'; count: number; presetsRestored?: boolean } | { type: 'error' } | null>(null);
  // Stable hover for import button - hover hitbox stays stable even when button shrinks
  const { hovered: importHovered, containerProps: importContainerProps } = useStableHover();
  const { hue, saturation, lightness, bgHue, bgSaturation, bgLightness, presets, customPresets, setPresets, setCustomPresets } = useTheme();
  // Dynamic status colors using WCAG contrast ratios
  const { confirm: confirmColor, error: errorColor } = useMemo(
    () => getStatusColors(hue, saturation, lightness, bgHue, bgSaturation, bgLightness),
    [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]
  );

  // Dismiss import feedback on keystroke (clicks are intentional actions)
  useEffect(() => {
    if (!importFeedback) return;

    const dismiss = () => setImportFeedback(null);

    // Use capture phase so this runs BEFORE any stopPropagation calls in buttons/pickers
    window.addEventListener('keydown', dismiss, true);

    return () => {
      window.removeEventListener('keydown', dismiss, true);
    };
  }, [importFeedback]);

  // Shared logic: process a single backup file's content string
  // Presets are threaded through (like entries) to avoid stale closure bugs in multi-file import
  const processBackupContent = async (
    fileContent: string,
    currentEntries: JournalEntry[],
    currentPresets: ColorPreset[],
    currentCustomPresets: ColorPreset[],
    label: string,
  ): Promise<{
    entries: JournalEntry[];
    importedCount: number;
    presets: ColorPreset[];
    customPresets: ColorPreset[];
    presetsChanged: boolean;
  } | null> => {
    if (!fileContent) return null;

    // Extract encrypted content (skips any header lines)
    const encryptedContent = parseEncryptedBackup(fileContent);
    if (!encryptedContent) {
      console.error(`No encrypted content found in: ${label}`);
      return null;
    }

    // Decrypt - this validates it's actually our backup (wrong files fail decryption)
    const decrypted = await decryptText(encryptedContent);

    // Try JSON format first (v1+), fall back to legacy markdown
    const backup = parseBackupJson(decrypted);

    if (backup) {
      // JSON format - entries already have HTML content
      const result = mergeJsonEntries(currentEntries, backup.entries, Date.now());

      let presetsChanged = false;
      let newPresets = currentPresets;
      let newCustomPresets = currentCustomPresets;

      if (backup.presets) {
        // Before replacing defaults, save any that would be lost as custom presets
        // A default is "orphaned" if it doesn't exist in the incoming presets or current customs
        const allIncoming = [...backup.presets, ...(backup.customPresets || [])];
        for (const existing of currentPresets) {
          const preserved = allIncoming.some(p => presetsEqual(p, existing)) ||
            newCustomPresets.some(p => presetsEqual(p, existing));
          if (!preserved) {
            newCustomPresets = [...newCustomPresets, existing];
            presetsChanged = true;
          }
        }
        // Check if defaults actually differ before flagging as changed
        const defaultsChanged = backup.presets.length !== currentPresets.length ||
          backup.presets.some((p, i) => !presetsEqual(p, currentPresets[i]));
        if (defaultsChanged) presetsChanged = true;
        newPresets = backup.presets;
      }

      if (backup.customPresets && backup.customPresets.length > 0) {
        // Merge: keep existing custom presets, add new unique ones from backup
        for (const imported of backup.customPresets) {
          const isDuplicate = newCustomPresets.some(e => presetsEqual(e, imported));
          if (!isDuplicate) {
            newCustomPresets = [...newCustomPresets, imported];
            presetsChanged = true;
          }
        }
      }

      return {
        entries: result.entries,
        importedCount: result.importedCount,
        presets: newPresets,
        customPresets: newCustomPresets,
        presetsChanged,
      };
    } else {
      // Legacy markdown format - needs HTML conversion
      const parsed = parseBackupText(decrypted);
      const result = mergeEntries(currentEntries, parsed, Date.now());
      return {
        entries: result.entries,
        importedCount: result.importedCount,
        presets: currentPresets,
        customPresets: currentCustomPresets,
        presetsChanged: false,
      };
    }
  };

  const handleImport = async () => {
    // --- Electron path: use native open dialog via IPC ---
    if (window.electronAPI) {
      logAction('import.start', { fileCount: 1 });
      try {
        const fileContent = await window.electronAPI.backup.importBackup();
        if (!fileContent) return; // User cancelled

        const result = await processBackupContent(fileContent, entries, presets, customPresets, 'electron-import');
        if (result) {
          onImport(result.entries);
          if (result.presetsChanged) {
            setPresets(result.presets);
            setCustomPresets(result.customPresets);
          }
          setImportFeedback({ type: 'success', count: result.importedCount, presetsRestored: result.presetsChanged });
          logAction('import.done', { totalImported: result.importedCount, fileCount: 1, presetsRestored: result.presetsChanged });
        } else {
          setImportFeedback({ type: 'error' });
          logAction('import.fail', { fileCount: 1 });
        }
      } catch (err) {
        console.error('Failed to import backup (electron):', err);
        setImportFeedback({ type: 'error' });
        logAction('import.fail', { fileCount: 1 });
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    logAction('import.start', { fileCount: files.length });

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
    let currentPresets = presets;
    let currentCustomPresets = customPresets;
    let totalImported = 0;
    let anyFileSucceeded = false;
    let anyPresetsChanged = false;

    // Process all files sequentially — presets are threaded through like entries
    for (const file of Array.from(files)) {
      try {
        const fileContent = await readFile(file);
        const result = await processBackupContent(fileContent, currentEntries, currentPresets, currentCustomPresets, file.name);
        if (result) {
          currentEntries = result.entries;
          currentPresets = result.presets;
          currentCustomPresets = result.customPresets;
          totalImported += result.importedCount;
          anyFileSucceeded = true;
          if (result.presetsChanged) anyPresetsChanged = true;
        }
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
      }
    }

    // Show error only if ALL files failed — no valid file was processed at all
    if (!anyFileSucceeded) {
      setImportFeedback({ type: 'error' });
      logAction('import.fail', { fileCount: files.length });
    } else {
      onImport(currentEntries);
      if (anyPresetsChanged) {
        setPresets(currentPresets);
        setCustomPresets(currentCustomPresets);
      }
      setImportFeedback({ type: 'success', count: totalImported, presetsRestored: anyPresetsChanged });
      logAction('import.done', { totalImported, fileCount: files.length, presetsRestored: anyPresetsChanged });
    }

    // Reset input so same files can be selected again
    e.target.value = '';
  };

  const handleBackup = async () => {
    if (entries.length === 0) return;

    try {
      // Use JSON format for backup (v2: includes color presets)
      const jsonContent = formatEntriesAsJson(entries, presets, customPresets);
      const encrypted = await encryptText(jsonContent);
      const fileContent = formatEncryptedBackup(encrypted);

      const now = new Date();
      // Filename: good days backup MM-DD-YYYY HHmmss.txt (zero-padded, always military time, no colons - macOS converts them to underscores)
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const filename = `good days backup ${month}-${day}-${year} ${hours}${minutes}${seconds}.txt`;

      // --- Electron path: use native save dialog via IPC ---
      if (window.electronAPI) {
        await window.electronAPI.backup.saveBackup(fileContent, filename);
        logAction('export.backup', { entryCount: entries.length });
        return;
      }

      const blob = new Blob([fileContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logAction('export.backup', { entryCount: entries.length });
    } catch (err) {
      console.error('Failed to encrypt backup:', err);
      logAction('export.backup.fail');
    }
  };

  const handleCopyToClipboard = async () => {
    // Poweruser mode: markdown format, Normal mode: plain text
    const textContent = stacked ? formatEntriesAsText(entries) : formatEntriesForClipboard(entries);
    if (!textContent) return;

    try {
      await navigator.clipboard.writeText(textContent);
      logAction('export.clipboard', { format: stacked ? 'markdown' : 'plaintext' });
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
        <span>{s(stacked ? 'copy markdown format' : 'copy entries')}</span>
      </FunctionButton>
      <FunctionButton onClick={handleBackup} disabled={entries.length === 0} size="sm">
        <Upload className="w-3 h-3" />
        <span>{s(stacked ? 'download AES-256-GCM backup' : 'download backup')}</span>
      </FunctionButton>
      {/* Stable hover container - hover hitbox stays stable even when button shrinks */}
      <div {...importContainerProps}>
        <FunctionButton
          onClick={handleImport}
          size="sm"
          overrideColor={importFeedback ? (importFeedback.type === 'success' ? confirmColor : errorColor) : undefined}
        >
          {!importFeedback && <Download className="w-3 h-3" />}
          <span>
            {importFeedback
              ? importFeedback.type === 'success'
                ? s(`${importFeedback.count} ${importFeedback.count === 1 ? 'entry' : 'entries'} imported${importFeedback.presetsRestored ? ' + presets' : ''}`)
                : s('import failed')
              : stacked && importHovered
                ? s('multiple files accepted')
                : s(stacked ? 'import AES-256-GCM backup' : 'import backup')}
          </span>
        </FunctionButton>
      </div>
    </div>
  );
}

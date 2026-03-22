import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Download, Copy } from 'lucide-react';
import type { JournalEntry } from '@features/journal';
import { formatEntriesAsJson, formatEntriesAsText, formatEntriesForClipboard, formatV3Backup } from '../utils/formatEntries';
import { parseBackupJson, parseBackupText, mergeJsonEntries, mergeEntries, isV3Backup, type ParsedBackupV3 } from '../utils/parseBackup';
import { encryptText, decryptText, formatEncryptedBackup, parseEncryptedBackup, derivePasswordKey, getAppEncryptKey, unwrapDEK, decryptWithKey } from '@shared/crypto';
import { getRawEncryptedEntries, getWrappedDEK, getCurrentEncryptionKey } from '@shared/storage/journalStorage';
import type { BackupV3Payload } from '../utils/formatEntries';
import { FunctionButton } from '@shared/components';
import { scrambleText } from '@shared/utils/scramble';
import { STATUS_GREEN, STATUS_RED } from '@shared/utils/confirmColor';
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
  const [importFeedback, setImportFeedback] = useState<{ type: 'success'; count: number; presetsImportedCount?: number } | { type: 'error' } | null>(null);

  // v3 import password prompt state
  const [v3PasswordNeeded, setV3PasswordNeeded] = useState(false);
  const [v3PendingBackup, setV3PendingBackup] = useState<ParsedBackupV3 | null>(null);
  const [v3PasswordInput, setV3PasswordInput] = useState('');
  const [v3FlashState, setV3FlashState] = useState<'none' | 'red'>('none');
  const v3PasswordRef = useRef<HTMLInputElement>(null);

  // Bold sweep animation for "backup password" placeholder
  const v3PlaceholderText = 'backup password';
  const [v3BoldCount, setV3BoldCount] = useState(0);
  const [v3AnimPhase, setV3AnimPhase] = useState<'bold' | 'unbold'>('bold');
  const v3ShowPlaceholder = v3PasswordNeeded && v3PasswordInput === '';

  useEffect(() => {
    if (!v3ShowPlaceholder) return;
    if (v3AnimPhase === 'bold') {
      if (v3BoldCount >= v3PlaceholderText.length) {
        setV3AnimPhase('unbold');
        setV3BoldCount(0);
        return;
      }
      const timer = setTimeout(() => setV3BoldCount(c => c + 1), 83);
      return () => clearTimeout(timer);
    }
    if (v3AnimPhase === 'unbold') {
      if (v3BoldCount >= v3PlaceholderText.length) {
        setV3AnimPhase('bold');
        setV3BoldCount(0);
        return;
      }
      const timer = setTimeout(() => setV3BoldCount(c => c + 1), 83);
      return () => clearTimeout(timer);
    }
  }, [v3ShowPlaceholder, v3BoldCount, v3AnimPhase]);

  // Reset animation when placeholder becomes visible
  useEffect(() => {
    if (v3ShowPlaceholder) {
      setV3BoldCount(0);
      setV3AnimPhase('bold');
    }
  }, [v3ShowPlaceholder]);

  // Triple flash for wrong password (3x 80ms flash, 80ms gaps)
  const flashV3Red = useCallback(() => {
    setV3FlashState('red');
    setTimeout(() => setV3FlashState('none'), 80);
    setTimeout(() => setV3FlashState('red'), 160);
    setTimeout(() => setV3FlashState('none'), 240);
    setTimeout(() => setV3FlashState('red'), 320);
    setTimeout(() => setV3FlashState('none'), 400);
  }, []);

  const { presets, customPresets, setPresets, setCustomPresets } = useTheme();
  const confirmColor = STATUS_GREEN;
  const errorColor = STATUS_RED;

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

  // Decrypt v3 backup: first decrypt the outer payload, then decrypt individual entries
  const decryptV3Backup = useCallback(async (
    backup: ParsedBackupV3,
    dek: CryptoKey,
  ): Promise<{ entries: JournalEntry[]; presets: ColorPreset[] | null; customPresets: ColorPreset[] | null }> => {
    // Decrypt the outer payload (dates, presets, encrypted entry records)
    const payloadJson = await decryptWithKey(backup.payload, dek);
    const payload: BackupV3Payload = JSON.parse(payloadJson);

    // Decrypt individual entry payloads
    const decrypted: JournalEntry[] = [];
    for (const record of payload.encryptedEntries) {
      if (!record._payload) continue;
      try {
        const json = await decryptWithKey(record._payload, dek);
        const { content, title } = JSON.parse(json);
        decrypted.push({
          date: record.date,
          content: content ?? '',
          title,
          startedAt: record.startedAt,
          lastModified: record.lastModified,
        });
      } catch {
        console.error(`Failed to decrypt v3 entry: ${record.date}`);
      }
    }
    return {
      entries: decrypted,
      presets: payload.presets ?? null,
      customPresets: payload.customPresets ?? null,
    };
  }, []);

  // Handle v3 password-protected import: user submits password
  const handleV3PasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v3PendingBackup) return;

    try {
      const kek = await derivePasswordKey(v3PasswordInput.trim());
      const dek = await unwrapDEK(v3PendingBackup.dek.wrapped, kek);
      const v3Data = await decryptV3Backup(v3PendingBackup, dek);

      // Merge entries
      const result = mergeJsonEntries(entries, v3Data.entries, Date.now());
      let currentPresets = presets;
      let currentCustomPresets = customPresets;
      let presetsImportedCount = 0;

      if (v3Data.presets) {
        for (const imported of v3Data.presets) {
          if (!currentPresets.some(e => presetsEqual(e, imported))) {
            currentPresets = [...currentPresets, imported];
            presetsImportedCount++;
          }
        }
      }
      if (v3Data.customPresets) {
        for (const imported of v3Data.customPresets) {
          if (!currentCustomPresets.some(e => presetsEqual(e, imported))) {
            currentCustomPresets = [...currentCustomPresets, imported];
            presetsImportedCount++;
          }
        }
      }

      onImport(result.entries);
      if (presetsImportedCount > 0) {
        setPresets(currentPresets);
        setCustomPresets(currentCustomPresets);
      }
      setImportFeedback({ type: 'success', count: result.importedCount, presetsImportedCount });
      logAction('import.done.v3', { totalImported: result.importedCount, presetsImported: presetsImportedCount });

      // Clear password state
      setV3PasswordNeeded(false);
      setV3PendingBackup(null);
      setV3PasswordInput('');
      setV3FlashState('none');
    } catch {
      // Wrong password — unwrapDEK fails, triple flash
      flashV3Red();
      setV3PasswordInput('');
      v3PasswordRef.current?.focus();
    }
  }, [v3PendingBackup, v3PasswordInput, entries, presets, customPresets, onImport, setPresets, setCustomPresets, decryptV3Backup, flashV3Red]);

  // Shared logic: process a single backup file's content string
  // Custom presets are threaded through (like entries) to avoid stale closure in multi-file import
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
    presetsImportedCount: number;
  } | null> => {
    if (!fileContent) return null;

    // Try v3 format first (not outer-encrypted, raw JSON with encrypted entries)
    const v3Direct = parseBackupJson(fileContent);
    if (v3Direct && isV3Backup(v3Direct)) {
      // v3 backup — needs DEK to decrypt entries
      if (v3Direct.dek.protection === 'password') {
        // Password-protected: save for password prompt, return null to signal async flow
        setV3PendingBackup(v3Direct);
        setV3PasswordNeeded(true);
        setV3FlashState('none');
        setV3PasswordInput('');
        setTimeout(() => v3PasswordRef.current?.focus(), 100);
        return null; // Will be processed after password entry
      }
      // App-key protected: unwrap with APP_SECRET KEK, decrypt payload
      const appKEK = await getAppEncryptKey();
      const dek = await unwrapDEK(v3Direct.dek.wrapped, appKEK);
      const v3Data = await decryptV3Backup(v3Direct, dek);
      const result = mergeJsonEntries(currentEntries, v3Data.entries, Date.now());

      let newPresets = currentPresets;
      let newCustomPresets = currentCustomPresets;
      let presetsImportedCount = 0;
      if (v3Data.presets) {
        for (const imported of v3Data.presets) {
          if (!newPresets.some(e => presetsEqual(e, imported))) {
            newPresets = [...newPresets, imported];
            presetsImportedCount++;
          }
        }
      }
      if (v3Data.customPresets) {
        for (const imported of v3Data.customPresets) {
          if (!newCustomPresets.some(e => presetsEqual(e, imported))) {
            newCustomPresets = [...newCustomPresets, imported];
            presetsImportedCount++;
          }
        }
      }
      return { entries: result.entries, importedCount: result.importedCount, presets: newPresets, customPresets: newCustomPresets, presetsImportedCount };
    }

    // Legacy path: outer-encrypted with APP_SECRET backup key
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

    if (backup && !isV3Backup(backup)) {
      const result = mergeJsonEntries(currentEntries, backup.entries, Date.now());

      // Merge default presets: keep existing, add back any missing from backup
      let newPresets = currentPresets;
      let presetsImportedCount = 0;

      if (backup.presets && backup.presets.length > 0) {
        for (const imported of backup.presets) {
          const isDuplicate = newPresets.some(e => presetsEqual(e, imported));
          if (!isDuplicate) {
            newPresets = [...newPresets, imported];
            presetsImportedCount++;
          }
        }
      }

      // Merge custom presets: keep existing, add new unique ones from backup
      let newCustomPresets = currentCustomPresets;

      if (backup.customPresets && backup.customPresets.length > 0) {
        for (const imported of backup.customPresets) {
          const isDuplicate = newCustomPresets.some(e => presetsEqual(e, imported));
          if (!isDuplicate) {
            newCustomPresets = [...newCustomPresets, imported];
            presetsImportedCount++;
          }
        }
      }

      return { entries: result.entries, importedCount: result.importedCount, presets: newPresets, customPresets: newCustomPresets, presetsImportedCount };
    } else {
      const parsed = parseBackupText(decrypted);
      const result = mergeEntries(currentEntries, parsed, Date.now());
      return { entries: result.entries, importedCount: result.importedCount, presets: currentPresets, customPresets: currentCustomPresets, presetsImportedCount: 0 };
    }
  };

  const handleImport = async () => {
    // If feedback is showing, first click clears it. Next click opens file picker.
    if (importFeedback) {
      setImportFeedback(null);
      return;
    }

    // --- Electron path: use native open dialog via IPC ---
    if (window.electronAPI) {
      logAction('import.start', { fileCount: 1 });
      try {
        const fileContent = await window.electronAPI.backup.importBackup();
        if (!fileContent) return; // User cancelled

        const result = await processBackupContent(fileContent, entries, presets, customPresets, 'electron-import');
        if (result) {
          onImport(result.entries);
          if (result.presetsImportedCount > 0) {
            setPresets(result.presets);
            setCustomPresets(result.customPresets);
          }
          setImportFeedback({ type: 'success', count: result.importedCount, presetsImportedCount: result.presetsImportedCount });
          logAction('import.done', { totalImported: result.importedCount, fileCount: 1, presetsImported: result.presetsImportedCount });
        } else if (!v3PasswordNeeded) {
          // Only show error if not waiting for v3 password prompt
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
    let totalPresetsImported = 0;
    let v3PasswordPending = false;

    // Process all files sequentially — presets threaded through like entries
    for (const file of Array.from(files)) {
      try {
        const fileContent = await readFile(file);
        const result = await processBackupContent(fileContent, currentEntries, currentPresets, currentCustomPresets, file.name);
        if (result) {
          currentEntries = result.entries;
          currentPresets = result.presets;
          currentCustomPresets = result.customPresets;
          totalImported += result.importedCount;
          totalPresetsImported += result.presetsImportedCount;
          anyFileSucceeded = true;
        } else {
          // Check if v3 password prompt was triggered (null return + state was set)
          // Use a local flag since React state won't have updated yet
          try {
            const parsed = JSON.parse(fileContent);
            if (parsed?.version === 3 && parsed?.dek?.protection === 'password') {
              v3PasswordPending = true;
            }
          } catch { /* not JSON, ignore */ }
        }
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
      }
    }

    // Show error only if ALL files failed AND we're not waiting for v3 password
    if (!anyFileSucceeded && !v3PasswordPending) {
      setImportFeedback({ type: 'error' });
      logAction('import.fail', { fileCount: files.length });
    } else if (anyFileSucceeded) {
      onImport(currentEntries);
      if (totalPresetsImported > 0) {
        setPresets(currentPresets);
        setCustomPresets(currentCustomPresets);
      }
      setImportFeedback({ type: 'success', count: totalImported, presetsImportedCount: totalPresetsImported });
      logAction('import.done', { totalImported, fileCount: files.length, presetsImported: totalPresetsImported });
    }

    // Reset input so same files can be selected again
    e.target.value = '';
  };

  const handleBackup = async () => {
    if (entries.length === 0) return;

    try {
      // Check if DEK/KEK is active — use v3 format (entries stay encrypted, no decrypt needed)
      const wrappedDEK = await getWrappedDEK();
      let fileContent: string;

      if (wrappedDEK) {
        // v3: bundle encrypted entries + wrapped DEK, encrypt entire payload with DEK
        const rawEntries = await getRawEncryptedEntries();
        const dek = getCurrentEncryptionKey();
        if (!dek) throw new Error('No DEK available for backup');
        fileContent = await formatV3Backup(rawEntries, wrappedDEK, dek, presets, customPresets);
      } else {
        // Legacy v2: decrypt all entries, format as JSON, encrypt with backup key
        const jsonContent = formatEntriesAsJson(entries, presets, customPresets);
        const encrypted = await encryptText(jsonContent);
        fileContent = formatEncryptedBackup(encrypted);
      }

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
        accept=".txt,.json"
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
      <FunctionButton
        onClick={handleImport}
        size="sm"
        overrideColor={importFeedback ? (importFeedback.type === 'success' ? confirmColor : errorColor) : undefined}
        hoverChildren={stacked && !importFeedback ? <><Download className="w-3 h-3" /><span>{s('multiple files accepted')}</span></> : undefined}
      >
        {!importFeedback && <Download className="w-3 h-3" />}
        <span>
          {importFeedback
            ? importFeedback.type === 'success'
              ? s(`${importFeedback.count} ${importFeedback.count === 1 ? 'entry' : 'entries'}${importFeedback.presetsImportedCount ? ` + ${importFeedback.presetsImportedCount} ${importFeedback.presetsImportedCount === 1 ? 'preset' : 'presets'}` : ''} imported`)
              : s('import failed')
            : s(stacked ? 'import AES-256-GCM backup' : 'import backup')}
        </span>
      </FunctionButton>
      {v3PasswordNeeded && (
        <form onSubmit={handleV3PasswordSubmit} className="mt-2">
          <div style={{ position: 'relative' }}>
            <input
              ref={v3PasswordRef}
              type="password"
              value={v3PasswordInput}
              onChange={(e) => { setV3PasswordInput(e.target.value); }}
              className="w-full px-3 py-2 text-xs font-mono font-bold rounded"
              style={{
                backgroundColor: `hsl(var(--bh), var(--bs), var(--bl))`,
                border: `3px solid ${v3FlashState === 'red' ? '#ef4444' : `hsla(var(--h), var(--s), var(--l), 0.6)`}`,
                color: `hsl(var(--h), var(--s), var(--l))`,
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setV3PasswordNeeded(false);
                  setV3PendingBackup(null);
                  setV3PasswordInput('');
                  setV3FlashState('none');
                }
              }}
            />
            {v3ShowPlaceholder && (
              <div
                className="absolute top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none"
                style={{ color: `hsl(var(--h), var(--s), var(--l))`, opacity: 0.85, left: '14px' }}
              >
                {v3AnimPhase === 'bold' ? (
                  <>
                    <span className="font-bold">{s(v3PlaceholderText.slice(0, v3BoldCount))}</span>
                    <span>{s(v3PlaceholderText.slice(v3BoldCount))}</span>
                  </>
                ) : (
                  <>
                    <span>{s(v3PlaceholderText.slice(0, v3BoldCount))}</span>
                    <span className="font-bold">{s(v3PlaceholderText.slice(v3BoldCount))}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

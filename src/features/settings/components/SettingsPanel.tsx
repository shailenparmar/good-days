import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Bug } from 'lucide-react';
import { ColorPicker, PresetGrid } from '@features/theme';
import { PasswordSettings } from '@features/auth';
import { ExportButtons } from '@features/export';
import { TimeDisplay } from './TimeDisplay';
import { FunctionButton } from '@shared/components';
import { scrambleText } from '@shared/utils/scramble';
import { getItem, setItem } from '@shared/storage';
import { cancelPendingSaves, clearJournalStorage } from '@shared/storage/journalStorage';
import { logAction, exportLogs } from '@shared/logger';
import { VERSION } from '@shared/version';
import type { JournalEntry } from '@features/journal';

interface SettingsPanelProps {
  showDebugMenu: boolean;
  hasPassword: boolean;
  verifyPassword: (password: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<boolean>;
  changePassword: (password: string) => Promise<boolean>;
  removePassword: () => void;
  entries: JournalEntry[];
  onImport: (entries: JournalEntry[]) => void;
  stacked?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
  scrambleHotkeyActive?: boolean;
  onToggleScrambleHotkey?: () => void;
}

export function SettingsPanel({
  showDebugMenu,
  hasPassword,
  verifyPassword,
  setPassword,
  changePassword,
  removePassword,
  entries,
  onImport,
  stacked,
  superscramble,
  scrambleSeed,
  scrambleHotkeyActive,
  onToggleScrambleHotkey,
}: SettingsPanelProps) {
  // Suppress unused variable warning
  void scrambleSeed;
  const [resetStep, setResetStep] = useState(0); // 0: reset app, 1: are you sure?, 2: are you sure you're sure?!

  // Scroll position persistence
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimeout = useRef<number | null>(null);

  // Restore scroll position on mount
  useEffect(() => {
    const savedScroll = getItem('settingsScrollTop');
    if (savedScroll && scrollRef.current) {
      scrollRef.current.scrollTop = parseFloat(savedScroll);
    }
  }, []);

  // Save scroll position (debounced)
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    if (scrollSaveTimeout.current !== null) {
      clearTimeout(scrollSaveTimeout.current);
    }
    scrollSaveTimeout.current = window.setTimeout(() => {
      if (scrollRef.current) {
        setItem('settingsScrollTop', String(scrollRef.current.scrollTop));
      }
      scrollSaveTimeout.current = null;
    }, 100);
  }, []);



  const handleResetApp = async () => {
    if (resetStep < 2) {
      setResetStep(resetStep + 1);
      return;
    }
    logAction('settings.reset');
    // Prevent beforeunload from saving entries back to localStorage
    (window as { __resettingApp?: boolean }).__resettingApp = true;

    // Cancel any pending debounced saves (don't flush — we're deleting everything)
    cancelPendingSaves();

    // Clear IndexedDB stores first (works even with other open connections)
    try { await clearJournalStorage(); } catch {}

    // Clear localStorage
    localStorage.clear();

    // Delete entire database + reload
    const deleteRequest = indexedDB.deleteDatabase('good-days');
    deleteRequest.onsuccess = () => location.reload();
    deleteRequest.onerror = () => location.reload();
    deleteRequest.onblocked = () => location.reload();
  };

  const handleExportDebugLog = () => {
    const content = exportLogs(VERSION, entries.length);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    a.download = `good days debug log ${month}-${day}-${year} ${hours}${minutes}${seconds}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logAction('debug.exported');
  };

  const getResetButtonText = () => {
    switch (resetStep) {
      case 1: return 'are you sure?';
      case 2: return "are you sure you're sure?!";
      default: return 'reset app';
    }
  };

  if (!showDebugMenu) return null;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="w-80 flex flex-col h-screen overflow-y-auto overflow-x-hidden scrollbar-hide"
      style={{
        backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
        borderRight: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)'
      }}
    >
      {/* Color Picker Section */}
      <div
        className="p-4"
        style={{ borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)' }}
      >
        <div className="space-y-2">
          <PresetGrid showDebugMenu={showDebugMenu} superscramble={superscramble} scrambleSeed={scrambleSeed} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <ColorPicker type="text" part="sl" />
            <ColorPicker type="background" part="sl" />
            <ColorPicker type="text" part="hue" />
            <ColorPicker type="background" part="hue" />
          </div>
        </div>
      </div>

      {/* Password Settings Section */}
      <div
        className="p-4"
        style={{ borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)' }}
      >
        <PasswordSettings
          hasPassword={hasPassword}
          verifyPassword={verifyPassword}
          setPassword={setPassword}
          changePassword={changePassword}
          removePassword={removePassword}
          superscramble={superscramble}
          scrambleSeed={scrambleSeed}
        />
      </div>

      {/* Time Display Section */}
      <div
        className="p-4"
        style={{ borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)' }}
      >
        <TimeDisplay stacked={stacked} superscramble={superscramble} scrambleSeed={scrambleSeed} />
      </div>

      {/* Scramble Hotkey Toggle - only in poweruser mode */}
      {stacked && onToggleScrambleHotkey && (
        <div
          className="p-4"
          style={{ borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)' }}
        >
          <FunctionButton
            onClick={onToggleScrambleHotkey}
            isActive={scrambleHotkeyActive}
            size="sm"
            hoverChildren={scrambleHotkeyActive ? <span>{superscramble ? scrambleText('option/alt + s') : 'option/alt + s'}</span> : undefined}
          >
            <span>{superscramble ? scrambleText(scrambleHotkeyActive ? 'scramble hotkey activated' : 'scramble hotkey deactivated') : (scrambleHotkeyActive ? 'scramble hotkey activated' : 'scramble hotkey deactivated')}</span>
          </FunctionButton>
        </div>
      )}

      {/* Backup Section */}
      <div
        className="p-4"
        style={stacked ? { borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)' } : undefined}
      >
        <ExportButtons entries={entries} onImport={onImport} stacked={stacked} superscramble={superscramble} scrambleSeed={scrambleSeed} />
      </div>

      {/* Reset App + Debug Log - only in poweruser mode */}
      {stacked && (
        <div className="p-4 space-y-2">
          <FunctionButton onClick={handleExportDebugLog} size="sm">
            <Bug className="w-3 h-3" />
            <span>{superscramble ? scrambleText('export debug log') : 'export debug log'}</span>
          </FunctionButton>
          {/* Blackout overlay for final confirmation - portal to body to avoid stacking context issues */}
          {resetStep === 2 && createPortal(
            <div
              className="fixed inset-0 bg-black"
              style={{ zIndex: 9998 }}
              onClick={() => setResetStep(0)}
            />,
            document.body
          )}
          <div onMouseLeave={() => setResetStep(0)} className={resetStep === 2 ? 'relative rounded' : ''} style={resetStep === 2 ? { zIndex: 9999, backgroundColor: 'hsl(var(--bh), var(--bs), var(--bl))' } : undefined}>
            <FunctionButton onClick={handleResetApp} size="sm">
              <RotateCcw className="w-3 h-3" />
              <span>
                {superscramble ? scrambleText(getResetButtonText()) : getResetButtonText()}
              </span>
            </FunctionButton>
          </div>
        </div>
      )}
    </div>
  );
}

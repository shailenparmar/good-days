import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme, ColorPicker, PresetGrid } from '@features/theme';
import { PasswordSettings } from '@features/auth';
import { ExportButtons } from '@features/export';
import { TimeDisplay } from './TimeDisplay';
import { FunctionButton } from '@shared/components';
import { scrambleText } from '@shared/utils/scramble';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import { getItem, setItem } from '@shared/storage';
import type { JournalEntry } from '@features/journal';

interface SettingsPanelProps {
  showDebugMenu: boolean;
  hasPassword: boolean;
  verifyPassword: (password: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<boolean>;
  removePassword: () => void;
  entries: JournalEntry[];
  onImport: (entries: JournalEntry[]) => void;
  onCloseAbout: () => void;
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
  removePassword,
  entries,
  onImport,
  onCloseAbout,
  stacked,
  superscramble,
  scrambleSeed,
  scrambleHotkeyActive,
  onToggleScrambleHotkey,
}: SettingsPanelProps) {
  // Suppress unused variable warning
  void scrambleSeed;
  const { bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();
  const [hotkeyButtonHovered, setHotkeyButtonHovered] = useState(false);
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

  // Easter egg: saw the blackout screen
  useEffect(() => {
    if (resetStep === 2) markEasterEggFound('resetBlackout');
  }, [resetStep]);

  const handleResetApp = () => {
    if (resetStep < 2) {
      setResetStep(resetStep + 1);
      return;
    }
    // Actually reset the app
    localStorage.clear();
    // Clear IndexedDB if used
    indexedDB.deleteDatabase('good-days');
    location.reload();
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
      className="w-80 flex flex-col h-screen overflow-y-auto scrollbar-hide"
      style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={onCloseAbout}
    >
      {/* Color Picker Section - clicks here don't close about panel */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <PresetGrid showDebugMenu={showDebugMenu} superscramble={superscramble} scrambleSeed={scrambleSeed} />
          <ColorPicker type="text" />
          <ColorPicker type="background" />
        </div>
      </div>

      {/* Password Settings Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
      >
        <PasswordSettings
          hasPassword={hasPassword}
          verifyPassword={verifyPassword}
          setPassword={setPassword}
          removePassword={removePassword}
          superscramble={superscramble}
          scrambleSeed={scrambleSeed}
        />
      </div>

      {/* Time Display Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
      >
        <TimeDisplay stacked={stacked} superscramble={superscramble} scrambleSeed={scrambleSeed} />
      </div>

      {/* Scramble Hotkey Toggle - only in powerstat mode */}
      {stacked && onToggleScrambleHotkey && (
        <div
          className="p-4"
          style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
        >
          <div
            onMouseEnter={() => setHotkeyButtonHovered(true)}
            onMouseLeave={() => setHotkeyButtonHovered(false)}
          >
            <FunctionButton onClick={onToggleScrambleHotkey} isActive={scrambleHotkeyActive} size="sm">
              {scrambleHotkeyActive ? (
                // Grid overlay to prevent hover flicker (hover text "option/alt + s" is shorter than default)
                <span style={{ display: 'grid' }}>
                  <span style={{ gridRow: 1, gridColumn: 1, visibility: hotkeyButtonHovered ? 'visible' : 'hidden' }}>
                    {superscramble ? scrambleText('option/alt + s') : 'option/alt + s'}
                  </span>
                  <span style={{ gridRow: 1, gridColumn: 1, visibility: hotkeyButtonHovered ? 'hidden' : 'visible' }}>
                    {superscramble ? scrambleText('scramble hotkey activated') : 'scramble hotkey activated'}
                  </span>
                </span>
              ) : (
                <span>{superscramble ? scrambleText('scramble hotkey deactivated') : 'scramble hotkey deactivated'}</span>
              )}
            </FunctionButton>
          </div>
        </div>
      )}

      {/* Backup Section */}
      <div
        className="p-4"
        style={stacked ? { borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` } : undefined}
      >
        <ExportButtons entries={entries} onImport={onImport} stacked={stacked} superscramble={superscramble} scrambleSeed={scrambleSeed} />
      </div>

      {/* Reset App - only in powerstat mode */}
      {stacked && (
        <div className="p-4">
          {/* Blackout overlay for final confirmation */}
          {resetStep === 2 && (
            <div
              className="fixed inset-0 bg-black z-40"
              onClick={() => setResetStep(0)}
            />
          )}
          <div onMouseLeave={() => setResetStep(0)} className={resetStep === 2 ? 'relative z-50' : ''}>
            <FunctionButton onClick={handleResetApp} size="sm">
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

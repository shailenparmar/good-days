import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme, ColorPicker, PresetGrid } from '@features/theme';
import { PasswordSettings } from '@features/auth';
import { ExportButtons } from '@features/export';
import { TimeDisplay } from './TimeDisplay';
import { FunctionButton } from '@shared/components';
import { useStableHover } from '@shared/hooks';
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
  stacked,
  superscramble,
  scrambleSeed,
  scrambleHotkeyActive,
  onToggleScrambleHotkey,
}: SettingsPanelProps) {
  // Suppress unused variable warning
  void scrambleSeed;
  const { bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();
  // Stable hover for scramble hotkey button
  const { hovered: hotkeyButtonHovered, containerRef: hotkeyContainerRef, hoverLayerProps: hotkeyHoverProps } = useStableHover();
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


  const handleResetApp = async () => {
    if (resetStep < 2) {
      setResetStep(resetStep + 1);
      return;
    }
    // Prevent beforeunload from saving entries back to localStorage
    (window as { __resettingApp?: boolean }).__resettingApp = true;
    // Actually reset the app
    localStorage.clear();
    // Clear IndexedDB and wait for it to complete before reloading
    const deleteRequest = indexedDB.deleteDatabase('good-days');
    deleteRequest.onsuccess = () => location.reload();
    deleteRequest.onerror = () => location.reload();
    deleteRequest.onblocked = () => location.reload();
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
    >
      {/* Color Picker Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
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
          {/* Stable hover container - button visually shrinks, hover hitbox stays stable */}
          <div ref={hotkeyContainerRef} style={{ position: 'relative' }}>
            {/* Only enable stable hover when text changes (scrambleHotkeyActive) */}
            {scrambleHotkeyActive && <div {...hotkeyHoverProps} />}
            <FunctionButton onClick={onToggleScrambleHotkey} isActive={scrambleHotkeyActive} size="sm">
              <span>
                {(() => {
                  const showShortcut = hotkeyButtonHovered && scrambleHotkeyActive;
                  const text = showShortcut
                    ? 'option/alt + s'
                    : (scrambleHotkeyActive ? 'scramble hotkey activated' : 'scramble hotkey deactivated');
                  return superscramble ? scrambleText(text) : text;
                })()}
              </span>
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

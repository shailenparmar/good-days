import { useState } from 'react';
import { useTheme, ColorPicker, PresetGrid } from '@features/theme';
import { PasswordSettings } from '@features/auth';
import { ExportButtons } from '@features/export';
import { TimeDisplay } from './TimeDisplay';
import { FunctionButton } from '@shared/components';
import { scrambleText } from '@shared/utils/scramble';
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
  supermode?: boolean;
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
  supermode,
  scrambleSeed,
  scrambleHotkeyActive,
  onToggleScrambleHotkey,
}: SettingsPanelProps) {
  // Suppress unused variable warning
  void scrambleSeed;
  const { bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();
  const [hotkeyButtonHovered, setHotkeyButtonHovered] = useState(false);

  if (!showDebugMenu) return null;

  return (
    <div
      className="w-80 flex flex-col h-screen overflow-y-auto scrollbar-hide"
      style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={stacked ? undefined : onCloseAbout}
    >
      {/* Color Picker Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
      >
        <div className="space-y-2">
          <PresetGrid showDebugMenu={showDebugMenu} supermode={supermode} scrambleSeed={scrambleSeed} />
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
          supermode={supermode}
          scrambleSeed={scrambleSeed}
        />
      </div>

      {/* Time Display Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
      >
        <TimeDisplay stacked={stacked} supermode={supermode} scrambleSeed={scrambleSeed} />
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
              <span>
                {(() => {
                  // Only show shortcut on hover when activated
                  const showShortcut = hotkeyButtonHovered && scrambleHotkeyActive;
                  const text = showShortcut
                    ? 'option/alt + s'
                    : (scrambleHotkeyActive ? 'scramble hotkey activated' : 'scramble hotkey deactivated');
                  return supermode ? scrambleText(text) : text;
                })()}
              </span>
            </FunctionButton>
          </div>
        </div>
      )}

      {/* Backup Section */}
      <div className="p-4">
        <ExportButtons entries={entries} onImport={onImport} stacked={stacked} supermode={supermode} scrambleSeed={scrambleSeed} />
      </div>
    </div>
  );
}

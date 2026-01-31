import { useTheme, ColorPicker, PresetGrid } from '@features/theme';
import { PasswordSettings } from '@features/auth';
import { ExportButtons } from '@features/export';
import { TimeDisplay } from './TimeDisplay';
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
}: SettingsPanelProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;
  void supermode;
  const { bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

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
          <PresetGrid showDebugMenu={showDebugMenu} />
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
        />
      </div>

      {/* Time Display Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
      >
        <TimeDisplay />
      </div>

      {/* Backup Section */}
      <div className="p-4">
        <ExportButtons entries={entries} onImport={onImport} stacked={stacked} />
      </div>
    </div>
  );
}

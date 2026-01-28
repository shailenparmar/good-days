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
  entries: JournalEntry[];
  onCloseAbout: () => void;
}

export function SettingsPanel({
  showDebugMenu,
  hasPassword,
  verifyPassword,
  setPassword,
  entries,
  onCloseAbout,
}: SettingsPanelProps) {
  const { bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  if (!showDebugMenu) return null;

  return (
    <div
      className="w-80 flex flex-col h-screen overflow-y-auto scrollbar-hide"
      style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={onCloseAbout}
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
          {/* HSL Values Display */}
          <div className="text-xs font-mono pt-2" style={{ color: `hsl(${hue}, ${saturation}%, ${lightness}%)` }}>
            <div>text: hsl({hue}, {saturation}%, {lightness}%)</div>
            <div>bg: hsl({bgHue}, {bgSaturation}%, {bgLightness}%)</div>
          </div>
        </div>
      </div>

      {/* Time Display Section */}
      <div
        className="p-4"
        style={{ borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
      >
        <TimeDisplay />
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
        />
      </div>

      {/* Export Section */}
      <div className="p-4">
        <ExportButtons entries={entries} />
      </div>
    </div>
  );
}

import { useTheme } from '@features/theme';
import { ExternalLink } from 'lucide-react';
import { scrambleText } from '@shared/utils/scramble';

interface AboutPanelProps {
  isOpen: boolean;
  onCloseSettings: () => void;
  stacked?: boolean;
  supermode?: boolean;
  scrambleSeed?: number;
}

export function AboutPanel({ isOpen, onCloseSettings, stacked, supermode, scrambleSeed }: AboutPanelProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  // Helper to scramble text in supermode
  const s = (text: string) => supermode ? scrambleText(text) : text;
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  if (!isOpen) return null;

  const sectionStyle = {
    borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
  };

  return (
    <div
      className="flex flex-col h-screen overflow-y-auto scrollbar-hide select-none"
      style={{
        width: stacked ? '400px' : '675px',
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`,
      }}
      onClick={stacked ? undefined : onCloseSettings}
    >
      {/* Welcome */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-base leading-relaxed font-mono font-bold" style={{ color: getColor() }}>
          {s("welcome to good days, your time-capsule journal oasis.")}
        </p>
      </div>

      {/* Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>{s("privacy:")}</p>
          <p>
            {s("entries are not sent to a server. a developer couldn't view your writing even if they wanted to.")}
          </p>
          <p>
            {s("all data added lives on your hard drive in something called IndexedDB — local storage for large, long-term data. the website pulls from it to display your text, but entries never leave the hardware on your device.")}
          </p>
          <p>
            {s("as a safety guarantee, the entire product is open-source.")}{' '}
            <a
              href="https://github.com/shailenparmar/good-days"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: getColor() }}
            >
              <ExternalLink className="w-4 h-4" />
              {s("github")}
            </a>
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>{s("features:")}</p>
          <p>{s("a new page spawns at midnight; old logs are set in stone.")}</p>
          <p>{s("every character saves instantly. draft while scrambled to slip prying eyes or writer's block. clicking the footer bows in to zen mode. hold spacebar on rand for chaotic good. \\time delivers a stamp. about and settings join forces for powerstat mode.")}</p>
          <p>{s("write untethered courtesy of a desktop download; the right end of a chrome address bar shelters an install button. in safari, bother the share icon for add to dock.")}</p>
        </div>
      </div>

      {/* Personal note */}
      <div className="p-4">
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>
            {s("i hope this app disappears into your life. here's to many colorways and many more good days.")}
          </p>
          <p className="mt-4">
            {s("- shai")}
          </p>
        </div>
      </div>
    </div>
  );
}

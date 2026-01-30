import { useTheme } from '@features/theme';
import { ExternalLink } from 'lucide-react';

interface AboutPanelProps {
  isOpen: boolean;
  onCloseSettings: () => void;
}

export function AboutPanel({ isOpen, onCloseSettings }: AboutPanelProps) {
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  if (!isOpen) return null;

  const sectionStyle = {
    borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
  };

  return (
    <div
      className="flex flex-col h-screen overflow-y-auto scrollbar-hide select-none"
      style={{
        width: '630px',
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={onCloseSettings}
    >
      {/* Welcome */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-base leading-relaxed font-mono font-bold" style={{ color: getColor() }}>
          welcome to good days, your living time-capsule journal oasis.
        </p>
      </div>

      {/* Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>privacy:</p>
          <p>
            your writing and passwords are safe. i couldn't view your data even if i wanted to; it's technologically impossible.
          </p>
          <p>
            this is because everything you add is saved to a file on your hard drive called IndexedDB. the website pulls from it to display it, but it never leaves the hardware on your device.
          </p>
          <p>
            as a safety guarantee, you can verify the code currently running; the entire product is open-source.{' '}
            <a
              href="https://github.com/shailenparmar/good-days"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: getColor() }}
            >
              <ExternalLink className="w-4 h-4" />
              github
            </a>
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>features:</p>
          <p>
            a new page spawns at midnight; old logs are written in stone.
          </p>
          <p>
            draft while scrambled to beat writer's block or spying eyes.
          </p>
          <p>
            every character saves instantly. type \time for a timestamp.
          </p>
          <p>
            click the editor header to toggle zen mode.
          </p>
          <p>
            hold spacebar on rand for a quick party.
          </p>
          <p>
            download an app for offline use by clicking the install icon at the right end of the chrome address bar. in safari, click the share icon and "add to dock."
          </p>
        </div>
      </div>

      {/* Personal note */}
      <div className="p-4">
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>
            i designed this journal for my own daily use, and i'm elated to share it. here's to many colorways and many more good days.
          </p>
          <p className="mt-4">
            - shai
          </p>
        </div>
      </div>
    </div>
  );
}

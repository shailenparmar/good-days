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
      className="w-[32rem] flex flex-col h-screen overflow-y-auto scrollbar-hide select-none"
      style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
      onClick={onCloseSettings}
    >
      {/* Header */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-base leading-relaxed font-mono font-bold" style={{ color: getColor() }}>
          good days is your digital-analog journal oasis.
        </p>
      </div>

      {/* Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>
            your writing, passwords, and settings only exist on this device, even though you access the journal through a website.
          </p>
          <p>
            i couldn't view your content even if i wanted to; it's technologically impossible.
          </p>
          <p>
            this is because the data you add is saved to a file on your hard drive called IndexedDB. your browser pulls from it to display it, but it never leaves your device.
          </p>
          <p>
            as a safety guarantee, this app is open-source. you can press F12, Sources, and verify the code currently running.{' '}
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
          <p>
            IndexedDB = site data. so if you press "clear cookies and site data" in your browser's settings, you'll lose your entries. refreshing or quitting the browser is safe, though. it saves automatically.
          </p>
        </div>
      </div>

      {/* Personal note */}
      <div className="p-4">
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>
            i designed this journal for my own daily use, and i'm elated to share it.
          </p>
          <p>
            try typing while scrambled, adding the site to your dock, or holding spacebar on rand. here's to many colorways and many more good days.
          </p>
          <p className="mt-4">
            - shai
          </p>
        </div>
      </div>
    </div>
  );
}

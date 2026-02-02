import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { ExternalLink } from 'lucide-react';
import { scrambleText } from '@shared/utils/scramble';
import { getItem, setItem } from '@shared/storage';

interface AboutPanelProps {
  isOpen: boolean;
  onCloseSettings: () => void;
  stacked?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
}

export function AboutPanel({ isOpen, onCloseSettings, stacked, superscramble, scrambleSeed }: AboutPanelProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  // Scroll position persistence
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimeout = useRef<number | null>(null);

  // Restore scroll position on mount
  useEffect(() => {
    const savedScroll = getItem('aboutScrollTop');
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
        setItem('aboutScrollTop', String(scrollRef.current.scrollTop));
      }
      scrollSaveTimeout.current = null;
    }, 100);
  }, []);

  if (!isOpen) return null;

  const sectionStyle = {
    borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex flex-col h-screen overflow-y-auto scrollbar-hide select-none"
      style={{
        width: stacked ? '400px' : '720px',
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
            {s("all data added lives on your hard drive in a file called localStorage. the website pulls from it to display your text, but entries never leave the hardware on your device.")}
          </p>
          <p>
            {s("as a safety guarantee, all the code is open source.")}{' '}
            <a
              href="https://github.com/shailenparmar/good-days"
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              className="inline-flex items-center gap-1 transition-opacity hover:opacity-85 outline-none"
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
          <p>{s("every character saves instantly. draft while scrambled to slip prying eyes or writer's block. clicking the footer bows in to zen mode. hold spacebar on rand for chaotic good. \\time delivers a stamp. settings and about megazord for powerstats.")}</p>
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

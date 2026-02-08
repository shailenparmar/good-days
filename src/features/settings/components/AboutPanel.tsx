import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { ExternalLink } from 'lucide-react';
import { scrambleText } from '@shared/utils/scramble';
import { getStatusColors } from '@shared/utils/confirmColor';
import { getItem, setItem } from '@shared/storage';

interface AboutPanelProps {
  isOpen: boolean;
  stacked?: boolean;
  superscramble?: boolean;
  scrambleSeed?: number;
}

// Panel layout constants - ensures right edge alignment in both modes
// Change ABOUT_WIDTH if you want the About panel wider/narrower
// The About panel's right edge will be at the same position whether stacked or not
// Note: Tailwind uses border-box, so widths INCLUDE the 6px border
const ABOUT_WIDTH = 720;    // About panel width when alone (includes border)
const SETTINGS_WIDTH = 320; // Settings panel width (w-80, includes border)

export function AboutPanel({ isOpen, stacked, superscramble, scrambleSeed }: AboutPanelProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();
  const [linkHovered, setLinkHovered] = useState(false);
  const { confirm: confirmColor } = getStatusColors(hue, saturation, lightness, bgHue, bgSaturation, bgLightness);

  // Calculate About width to keep right edge aligned
  // With border-box, the 6px border is inside the width value
  const aboutWidth = stacked
    ? ABOUT_WIDTH - SETTINGS_WIDTH  // 400px
    : ABOUT_WIDTH;                   // 720px

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
      className="flex flex-col h-screen overflow-y-auto scrollbar-hide"
      contentEditable
      suppressContentEditableWarning
      style={{
        width: `${aboutWidth}px`,
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`,
      }}
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
            {s("entries are not sent to servers. a developer couldn't view your writing even if they wanted to.")}
          </p>
          <p>
            {s("everything added lives encrypted or hashed on your hard drive in IndexedDB — local storage for long-term data. the website pulls from it to display content, but entries, passwords, and colorways never leave your device's hardware.")}
          </p>
          <p>
            {s("however, if you manually delete site data in browser settings, you'll clear the journal. notably, Safari is the only major browser with inactivity deletion (7 days). other browsers will only delete data under disk space storage pressure.")}
          </p>
          <p>
            {s("as a safety guarantee, the entire product is open source.")}{' '}
            <a
              href="https://github.com/shailenparmar/good-days"
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              className="inline-flex items-center gap-1 outline-none"
              style={{ color: linkHovered ? confirmColor : getColor() }}
              onMouseEnter={() => setLinkHovered(true)}
              onMouseLeave={() => setLinkHovered(false)}
            >
              <ExternalLink className="w-4 h-4" />
              {s("GitHub")}
            </a>
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>{s("features:")}</p>
          <p>{s("a new page spawns at midnight; old logs are set in stone.")}</p>
          <p>{s("every character saves instantly. draft while scrambled to slip prying eyes or writer's block. clicking the footer bows in to zen mode. hold spacebar on rand for chaotic good. \\time delivers a stamp. settings and about join forces for a poweruser menu.")}</p>
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

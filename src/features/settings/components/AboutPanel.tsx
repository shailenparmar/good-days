import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { ExternalLink } from 'lucide-react';
import { scrambleText } from '@shared/utils/scramble';
import { getStatusColors } from '@shared/utils/confirmColor';
import { getItem, setItem } from '@shared/storage';
import { ABOUT_COPY } from '@shared/copy/aboutCopy';

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
  const { getColor, hue, saturation, lightness, bgHue, bgSaturation, bgLightness } = useTheme();
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
    borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)'
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex flex-col h-screen overflow-y-auto scrollbar-hide"
      style={{
        width: `${aboutWidth}px`,
        backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
        borderRight: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)',
      }}
    >
      {/* Welcome */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-base leading-relaxed font-mono font-bold" style={{ color: getColor() }}>
          {s(ABOUT_COPY.welcome)}
        </p>
      </div>

      {/* Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>{s(ABOUT_COPY.privacy.header)}</p>
          {ABOUT_COPY.privacy.paragraphs.slice(0, -1).map((p, i) => (
            <p key={i}>{s(p)}</p>
          ))}
          <p>
            {s(ABOUT_COPY.privacy.paragraphs[ABOUT_COPY.privacy.paragraphs.length - 1])}{' '}
            <a
              href={ABOUT_COPY.privacy.githubUrl}
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
          <p>{s(ABOUT_COPY.features.header)}</p>
          {ABOUT_COPY.features.paragraphs.map((p, i) => (
            <p key={i}>{s(p)}</p>
          ))}
        </div>
      </div>

      {/* Personal note */}
      <div className="p-4">
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>
            {s(ABOUT_COPY.closing)}
          </p>
          <p className="mt-4">
            {s(ABOUT_COPY.signature)}
          </p>
        </div>
      </div>
    </div>
  );
}

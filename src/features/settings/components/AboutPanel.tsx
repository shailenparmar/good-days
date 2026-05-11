import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';

import { Link2, Settings, Heart } from 'lucide-react';
import { scrambleText } from '@shared/utils/scramble';
import { STATUS_GREEN } from '@shared/utils/confirmColor';
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
const ABOUT_WIDTH = 600;    // About panel width when alone (includes border)
const SETTINGS_WIDTH = 320; // Settings panel width (w-80, includes border)

export function AboutPanel({ isOpen, stacked, superscramble, scrambleSeed }: AboutPanelProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;

  // Icon map for [icon:name] tokens in about copy
  const iconMap: Record<string, React.ReactNode> = {
    settings: <Settings className="w-4 h-4 inline align-middle" />,
    about: <Heart className="w-4 h-4 inline align-middle" />,
  };

  // Render text with *word* as italic and [icon:name] as inline icons
  const renderWithEmphasis = (text: string) => {
    // Split on icons first, then handle emphasis within each text segment
    const iconParts = text.split(/\[icon:(\w+)\]/g);
    if (iconParts.length === 1) {
      // No icons — just handle emphasis
      const parts = text.split(/\*([^*]+)\*/g);
      if (parts.length === 1) return s(text);
      return parts.map((part, i) =>
        i % 2 === 1 ? <em key={i}>{s(part)}</em> : s(part)
      );
    }
    return iconParts.map((part, i) => {
      if (i % 2 === 1) return <span key={i}>{iconMap[part]}</span>;
      // Handle emphasis within text segments
      const emphParts = part.split(/\*([^*]+)\*/g);
      if (emphParts.length === 1) return <span key={i}>{s(part)}</span>;
      return <span key={i}>{emphParts.map((ep, j) =>
        j % 2 === 1 ? <em key={j}>{s(ep)}</em> : s(ep)
      )}</span>;
    });
  };
  const { getColor } = useTheme();
  const [linkHovered, setLinkHovered] = useState(false);
  const confirmColor = STATUS_GREEN;

  // Calculate About width to keep right edge aligned
  // With border-box, the 6px border is inside the width value
  const aboutWidth = stacked
    ? ABOUT_WIDTH - SETTINGS_WIDTH  // 280px
    : ABOUT_WIDTH;                   // 600px

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
      className="flex flex-col h-screen overflow-y-auto overflow-x-hidden scrollbar-hide select-none"
      style={{
        width: `${aboutWidth}px`,
        backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
        borderRight: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)',
      }}
    >
      {/* Welcome */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-sm font-mono font-extrabold" style={{ color: getColor() }}>
          {s(ABOUT_COPY.welcome)}
        </p>
      </div>

      {/* Features */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-sm font-mono font-extrabold space-y-4" style={{ color: getColor() }}>
          <p>{s(ABOUT_COPY.features.header)}</p>
          {ABOUT_COPY.features.paragraphs.map((p, i) => (
            <p key={i}>{renderWithEmphasis(p)}</p>
          ))}
        </div>
      </div>

      {/* Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-sm font-mono font-extrabold space-y-4" style={{ color: getColor() }}>
          <p>{s(ABOUT_COPY.privacy.header)}</p>
          {ABOUT_COPY.privacy.paragraphs.map((p, i) => (
            <p key={i}>{s(p)}</p>
          ))}
          <p>
            {s(ABOUT_COPY.privacy.lastParagraph)}{' '}
            <a
              href={ABOUT_COPY.privacy.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              className={`inline-flex items-center gap-1.5 outline-none${linkHovered ? ' status-pulse-green' : ''}`}
              style={{ color: linkHovered ? confirmColor : getColor() }}
              onMouseEnter={() => setLinkHovered(true)}
              onMouseLeave={() => setLinkHovered(false)}
              onClick={(e) => e.stopPropagation()}
            >
              <Link2 className="w-4 h-4" />
              {s("github")}
            </a>
          </p>
        </div>
      </div>

      {/* System */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-sm font-mono font-extrabold space-y-4" style={{ color: getColor() }}>
          <p>{s(ABOUT_COPY.system.header)}</p>
          {ABOUT_COPY.system.paragraphs.map((p, i) => (
            <p key={i}>{s(p)}</p>
          ))}
        </div>
      </div>

      {/* Personal note */}
      <div className="p-4">
        <div className="text-sm font-mono font-extrabold space-y-4" style={{ color: getColor() }}>
          <p>
            {s(ABOUT_COPY.closing)}
          </p>
          <p className="mt-4">
            {s(ABOUT_COPY.copyright)}
          </p>
        </div>
      </div>
    </div>
  );
}

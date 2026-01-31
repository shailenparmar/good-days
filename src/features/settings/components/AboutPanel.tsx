import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@features/theme';
import { ExternalLink } from 'lucide-react';
import { getItem, setItem } from '@shared/storage';

interface AboutPanelProps {
  isOpen: boolean;
  onCloseSettings: () => void;
}

export function AboutPanel({ isOpen, onCloseSettings }: AboutPanelProps) {
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();
  const [width, setWidth] = useState(() => {
    const saved = getItem('aboutPanelWidth');
    return saved ? Number(saved) : 705;
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Save width to localStorage
  useEffect(() => {
    setItem('aboutPanelWidth', String(width));
  }, [width]);

  // Handle drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startWidth: width };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const newWidth = Math.max(300, Math.min(900, dragRef.current.startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isOpen) return null;

  const sectionStyle = {
    borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
  };

  return (
    <div className="relative flex" style={{ width: `${width}px` }}>
      <div
        className="flex-1 flex flex-col h-screen overflow-y-auto scrollbar-hide outline-none"
        contentEditable
        suppressContentEditableWarning
        style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        }}
        onClick={onCloseSettings}
      >
      {/* Welcome */}
      <div className="p-4" style={sectionStyle}>
        <p className="text-base leading-relaxed font-mono font-bold" style={{ color: getColor() }}>
          welcome to good days, your time-capsule journal oasis.
        </p>
      </div>

      {/* Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>privacy:</p>
          <p>
            entries are not sent to a server. a developer couldn't view your writing even if they wanted to.
          </p>
          <p>
            all data lives on your hard drive in something called IndexedDB — local storage for large, long-term data. the website pulls from it to display your text, but entries never leave the hardware on your device.
          </p>
          <p>
            as a safety guarantee, the entire product is open-source.{' '}
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
          <p>a new page spawns at midnight; old logs are set in stone. every character saves instantly. draft while scrambled to beat writer's block or prying eyes. clicking the editor header bows into zen mode. hold spacebar on rand for chaotic good. typing \time delivers a stamp.</p>
          <p>write untethered courtesy of a desktop download; the right end of a chrome address bar shelters an install button. in safari, receive add to dock by bothering the share icon.</p>
        </div>
      </div>

      {/* Personal note */}
      <div className="p-4">
        <div className="text-base leading-relaxed font-mono font-bold space-y-4" style={{ color: getColor() }}>
          <p>
            i hope this app disappears into your life. here's to many colorways and many more good days.
          </p>
          <p className="mt-4">
            - shai
          </p>
        </div>
      </div>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-screen flex-shrink-0"
        style={{
          width: '6px',
          backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`,
          cursor: 'ew-resize',
        }}
      />
    </div>
  );
}

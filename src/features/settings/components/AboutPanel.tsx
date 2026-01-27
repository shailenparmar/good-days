import { useRef, useEffect } from 'react';
import { useTheme } from '@features/theme';
import { ExternalLink, Shield, HardDrive, Github } from 'lucide-react';

interface AboutPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutPanel({ isOpen, onClose }: AboutPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        // Don't close if clicking about toggle, settings toggle, or inside settings panel
        if (!target.closest('button[data-about-toggle]') &&
            !target.closest('button[data-settings-toggle]') &&
            !target.closest('[data-panel="settings"]')) {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sectionStyle = {
    borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
  };

  return (
    <div
      ref={panelRef}
      data-panel="about"
      className="w-80 flex flex-col h-screen overflow-y-auto scrollbar-hide"
      style={{
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
      }}
    >
      {/* Header */}
      <div className="p-4" style={sectionStyle}>
        <h2 className="text-lg font-bold font-mono" style={{ color: getColor() }}>
          about good days
        </h2>
        <p className="text-sm mt-2 opacity-80" style={{ color: getColor() }}>
          A simple, private journal for capturing your thoughts.
        </p>
      </div>

      {/* Data Privacy */}
      <div className="p-4" style={sectionStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4" style={{ color: getColor() }} />
          <h3 className="text-sm font-bold font-mono" style={{ color: getColor() }}>
            your data is private
          </h3>
        </div>
        <ul className="text-sm space-y-2 opacity-80" style={{ color: getColor() }}>
          <li className="flex items-start gap-2">
            <span className="mt-1">-</span>
            <span>All journal entries are stored <strong>locally on your device</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1">-</span>
            <span>Nothing is ever sent to any server</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1">-</span>
            <span>No accounts, no cloud sync, no tracking</span>
          </li>
        </ul>
      </div>

      {/* Storage Info */}
      <div className="p-4" style={sectionStyle}>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4" style={{ color: getColor() }} />
          <h3 className="text-sm font-bold font-mono" style={{ color: getColor() }}>
            where is my data?
          </h3>
        </div>
        <div className="text-sm space-y-2 opacity-80" style={{ color: getColor() }}>
          <p>
            <strong>Web browser:</strong> Your entries are saved in your browser's localStorage. They stay on your computer and persist between sessions.
          </p>
          <p>
            <strong>Desktop app:</strong> Your entries are saved to a local JSON file in your user data folder.
          </p>
          <p className="mt-3 text-xs opacity-70">
            Use the export feature in Settings to back up your entries anytime.
          </p>
        </div>
      </div>

      {/* Open Source */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Github className="w-4 h-4" style={{ color: getColor() }} />
          <h3 className="text-sm font-bold font-mono" style={{ color: getColor() }}>
            open source
          </h3>
        </div>
        <p className="text-sm opacity-80 mb-3" style={{ color: getColor() }}>
          This app is fully open source. You can review the code yourself to verify how your data is handled.
        </p>
        <a
          href="https://github.com/shailenparmar/good-days"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-mono rounded transition-opacity hover:opacity-80"
          style={{
            backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.15)`,
            color: getColor(),
            border: `2px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`
          }}
        >
          <ExternalLink className="w-3 h-3" />
          view on github
        </a>
      </div>
    </div>
  );
}

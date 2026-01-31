import { useTheme } from '@features/theme';
import { scrambleText } from '@shared/utils/scramble';

interface EntryFooterProps {
  currentContent: string;
  supermode?: boolean;
  scrambleSeed?: number;
  onClick?: () => void;
}

export function EntryFooter({ currentContent, supermode, scrambleSeed, onClick }: EntryFooterProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  const wordCount = currentContent.split(/\s+/).filter(Boolean).length;
  const charCount = currentContent.length;

  // Helper to scramble text in supermode
  const s = (text: string) => supermode ? scrambleText(text) : text;

  return (
    <div
      className="p-4 font-mono font-extrabold sticky bottom-0 z-10 text-right select-none"
      style={{
        fontSize: '14px',
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderTop: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`,
        color: getColor()
      }}
      onClick={onClick}
    >
      <span>{s(`${wordCount} words | ${charCount} chars`)}</span>
    </div>
  );
}

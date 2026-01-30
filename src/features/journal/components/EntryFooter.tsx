import { useTheme } from '@features/theme';

interface EntryFooterProps {
  currentContent: string;
}

export function EntryFooter({ currentContent }: EntryFooterProps) {
  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness } = useTheme();

  const wordCount = currentContent.split(/\s+/).filter(Boolean).length;
  const charCount = currentContent.length;

  return (
    <div
      className="p-4 font-mono font-extrabold sticky bottom-0 z-10 text-right select-none"
      style={{
        fontSize: '14px',
        backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
        borderTop: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`,
        color: getColor()
      }}
    >
      <span>{wordCount} words | {charCount} chars</span>
    </div>
  );
}

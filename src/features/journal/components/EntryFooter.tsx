import { useRef, useEffect } from 'react';
import { useTheme } from '@features/theme';
import { scrambleText } from '@shared/utils/scramble';

interface EntryFooterProps {
  currentContent: string;
  superscramble?: boolean;
  scrambleSeed?: number;
  onClick?: () => void;
  onHeightChange?: (height: number) => void;
}

export function EntryFooter({ currentContent, superscramble, scrambleSeed, onClick, onHeightChange }: EntryFooterProps) {
  // Suppress unused variable warning - scrambleSeed is used to trigger re-renders
  void scrambleSeed;

  const { getColor } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && onHeightChange) {
      onHeightChange(ref.current.getBoundingClientRect().height);
    }
  });

  const wordCount = currentContent.split(/\s+/).filter(Boolean).length;
  const charCount = currentContent.length;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;

  return (
    <div
      ref={ref}
      className="p-4 font-mono font-extrabold sticky bottom-0 z-10 text-right select-none"
      style={{
        fontSize: '14px',
        backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
        borderTop: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)',
        color: getColor()
      }}
      onClick={onClick}
      onMouseDown={(e) => {
        // Prevent double/triple click from selecting text in editor
        if (e.detail >= 2) {
          e.preventDefault();
        }
      }}
    >
      <span>{s(`${wordCount} words | ${charCount} chars`)}</span>
    </div>
  );
}

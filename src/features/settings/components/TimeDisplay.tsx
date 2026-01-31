import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@features/theme';
import { getItem, setItem } from '@shared/storage';
import { scrambleText } from '@shared/utils/scramble';

function TimeButton({
  onClick,
  isSelected,
  children,
  position
}: {
  onClick: () => void;
  isSelected: boolean;
  children: React.ReactNode;
  position: 'left' | 'right';
}) {
  const { getColor, hue, saturation, lightness } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const textColor = getColor();
  const borderColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const activeColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

  const getCurrentBorder = () => {
    if (isClicked) return activeColor;
    if (isHovered || isSelected) return textColor;
    return borderColor;
  };

  const currentBorder = getCurrentBorder();

  const getBackground = () => {
    if (isSelected || isHovered) return hoverBg;
    return 'transparent';
  };

  const borderStyle = position === 'left'
    ? { borderTop: `3px solid ${currentBorder}`, borderBottom: `3px solid ${currentBorder}`, borderLeft: `3px solid ${currentBorder}`, borderRight: `1px solid ${currentBorder}` }
    : { borderTop: `3px solid ${currentBorder}`, borderBottom: `3px solid ${currentBorder}`, borderRight: `3px solid ${currentBorder}`, borderLeft: `1px solid ${currentBorder}` };

  return (
    <button
      onClick={onClick}
      tabIndex={-1}
      className={`flex-1 px-3 py-2 text-xs font-mono font-bold outline-none focus:outline-none select-none ${position === 'left' ? 'rounded-l' : 'rounded-r'}`}
      style={{
        color: textColor,
        backgroundColor: getBackground(),
        ...borderStyle,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsClicked(true)}
      onMouseUp={() => setIsClicked(false)}
    >
      {children}
    </button>
  );
}

interface TimeDisplayProps {
  stacked?: boolean;
  supermode?: boolean;
  scrambleSeed?: number;
}

export function TimeDisplay({ stacked, supermode, scrambleSeed }: TimeDisplayProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [use24Hour, setUse24Hour] = useState(() => {
    const saved = getItem('timeFormat');
    return saved === '24h';
  });
  // Track if we were in supermode to refresh time on exit
  const wasInSupermode = useRef(false);

  // Freeze time updates in supermode, otherwise update based on stacked mode
  useEffect(() => {
    // If exiting supermode, immediately update to current time
    if (wasInSupermode.current && !supermode) {
      setCurrentTime(new Date());
    }
    wasInSupermode.current = !!supermode;

    // Don't run interval in supermode - freeze the display
    if (supermode) return;

    const interval = setInterval(() => setCurrentTime(new Date()), stacked ? 10 : 1000);
    return () => clearInterval(interval);
  }, [stacked, supermode]);

  // Suppress unused variable warning - scrambleSeed triggers re-renders
  void scrambleSeed;

  const handleFormatChange = (is24Hour: boolean) => {
    setUse24Hour(is24Hour);
    setItem('timeFormat', is24Hour ? '24h' : '12h');
  };

  const time12 = currentTime.toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });

  // Only show milliseconds in powerstat mode (stacked)
  let format12: string;
  let format24: string;

  if (stacked) {
    const ms = String(currentTime.getMilliseconds()).padStart(3, '0').slice(0, 2);
    const ampm = time12.slice(-2);
    const time12Base = time12.slice(0, -3);
    format12 = `${time12Base}.${ms} ${ampm}`;
    format24 = currentTime.toLocaleTimeString('en-US', { hour12: false }) + `.${ms}`;
  } else {
    format12 = time12;
    format24 = currentTime.toLocaleTimeString('en-US', { hour12: false });
  }

  // Helper to scramble text in supermode
  const s = (text: string) => supermode ? scrambleText(text) : text;

  return (
    <div className="flex justify-center overflow-hidden">
      <div className="flex w-full min-w-max">
        <TimeButton
        onClick={() => handleFormatChange(false)}
        isSelected={!use24Hour}
        position="left"
      >
        {s(format12)}
      </TimeButton>
      <TimeButton
        onClick={() => handleFormatChange(true)}
        isSelected={use24Hour}
        position="right"
      >
        {s(format24)}
      </TimeButton>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useTheme } from '@features/theme';
import { getItem, setItem } from '@shared/storage';

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
      className={`flex-1 px-3 py-2 text-xs font-mono font-bold outline-none focus:outline-none ${position === 'left' ? 'rounded-l' : 'rounded-r'}`}
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

export function TimeDisplay() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [use24Hour, setUse24Hour] = useState(() => {
    const saved = getItem('timeFormat');
    return saved === '24h';
  });

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFormatChange = (is24Hour: boolean) => {
    setUse24Hour(is24Hour);
    setItem('timeFormat', is24Hour ? '24h' : '12h');
  };

  const format12 = currentTime.toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
  const format24 = currentTime.toLocaleTimeString('en-US', { hour12: false });

  return (
    <div className="flex">
      <TimeButton
        onClick={() => handleFormatChange(false)}
        isSelected={!use24Hour}
        position="left"
      >
        {format12}
      </TimeButton>
      <TimeButton
        onClick={() => handleFormatChange(true)}
        isSelected={use24Hour}
        position="right"
      >
        {format24}
      </TimeButton>
    </div>
  );
}

import { useState } from 'react';
import { useTheme } from '@features/theme';

interface FunctionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
  dataAttribute?: string;
}

export function FunctionButton({ onClick, disabled, isActive, children, dataAttribute }: FunctionButtonProps) {
  const { getColor, hue, saturation, lightness } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const textColor = getColor();
  const borderDefault = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const borderActive = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

  const getBorderColor = () => {
    if (disabled) return borderDefault;
    if (isClicked) return borderActive;
    if (isHovered || isActive) return textColor;
    return borderDefault;
  };

  const getBackgroundColor = () => {
    if (isHovered || isActive) return hoverBg;
    return 'transparent';
  };

  return (
    <button
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      tabIndex={-1}
      data-settings-toggle={dataAttribute === 'settings-toggle' ? true : undefined}
      className="w-full px-3 py-2 text-xs font-mono font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 outline-none focus:outline-none"
      style={{
        color: textColor,
        backgroundColor: getBackgroundColor(),
        border: `3px solid ${getBorderColor()}`,
      }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsClicked(false); }}
      onMouseDown={() => !disabled && setIsClicked(true)}
      onMouseUp={() => setIsClicked(false)}
    >
      {children}
    </button>
  );
}

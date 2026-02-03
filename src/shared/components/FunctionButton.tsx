import { useState } from 'react';
import { useTheme } from '@features/theme';

interface FunctionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
  dataAttribute?: string;
  size?: 'sm' | 'default';
  ariaLabel?: string;
  title?: string;
  overrideColor?: string;
  fullWidth?: boolean;
}

export function FunctionButton({ onClick, disabled, isActive, children, dataAttribute, size = 'default', ariaLabel, title, overrideColor, fullWidth = true }: FunctionButtonProps) {
  const { getColor, hue, saturation, lightness } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const textColor = overrideColor || getColor();
  const borderDefault = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const borderActive = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

  const getBorderColor = () => {
    if (overrideColor) return overrideColor;
    if (disabled) return borderDefault;
    if (isClicked) return borderActive;
    if (isHovered || isActive) return textColor;
    return borderDefault;
  };

  const getBackgroundColor = () => {
    if (overrideColor) return 'transparent';
    if (isHovered || isActive) return hoverBg;
    return 'transparent';
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;
    onClick();
    e.currentTarget.blur();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      tabIndex={-1}
      data-settings-toggle={dataAttribute === 'settings-toggle' ? true : undefined}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      title={title}
      className={`w-full px-3 py-2 font-mono rounded flex items-center justify-center gap-2 outline-none focus:outline-none select-none ${size === 'sm' ? 'text-xs font-bold' : 'font-extrabold'} ${disabled && !overrideColor ? 'opacity-50' : ''}`}
      style={{
        fontSize: size === 'sm' ? undefined : '14px',
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

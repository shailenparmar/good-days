import { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@features/theme';

interface FunctionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
  hoverChildren?: React.ReactNode;
  dataAttribute?: string;
  size?: 'sm' | 'default';
  ariaLabel?: string;
  title?: string;
  overrideColor?: string;
  fullWidth?: boolean;
  className?: string;
}

export function FunctionButton({ onClick, disabled, isActive, children, hoverChildren, dataAttribute, size = 'default', ariaLabel, title, overrideColor, fullWidth = true, className: extraClassName }: FunctionButtonProps) {
  const { getColor } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  // Stable hover refs (only used when hoverChildren is provided)
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lockedRect = useRef<DOMRect | null>(null);

  const textColor = overrideColor || getColor();
  const borderDefault = 'hsla(var(--h), var(--s), var(--l), 0.6)';
  const borderActive = 'hsl(var(--h), var(--s), max(0%, calc(var(--l) * 0.65)))';
  const hoverBg = 'hsla(var(--h), var(--s), 50%, 0.2)';

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

  // --- Stable hover logic (only active when hoverChildren is provided) ---
  //
  // The button's native mouseEnter is ONLY used for initial entry detection.
  // Once hovered, the global mousemove listener owns ALL hover state — the
  // button's mouseEnter/mouseLeave are completely ignored. The exit zone
  // (max of locked rect + live rect + buffer) is the sole authority.
  // This prevents the shrunken button's native events from interfering
  // with the expanded exit zone.

  // Check if point is inside rect (with buffer to account for border width)
  const isInsideRect = (x: number, y: number, rect: DOMRect) => {
    const buffer = 3;
    return x >= rect.left - buffer && x <= rect.right + buffer && y >= rect.top - buffer && y <= rect.bottom + buffer;
  };

  // Exit zone: max(entry rect, current button rect)
  const getExitRect = useCallback(() => {
    if (!lockedRect.current) return null;
    if (!buttonRef.current) return lockedRect.current;
    const live = buttonRef.current.getBoundingClientRect();
    const f1 = lockedRect.current;
    return new DOMRect(
      Math.min(f1.left, live.left),
      Math.min(f1.top, live.top),
      Math.max(f1.right, live.right) - Math.min(f1.left, live.left),
      Math.max(f1.bottom, live.bottom) - Math.min(f1.top, live.top),
    );
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    if (hoverChildren !== undefined) {
      // Already in a hover cycle — ignore. Global mousemove owns hover state.
      if (lockedRect.current) return;
      // Initial entry: capture Frame 1 rect before content changes
      if (buttonRef.current) {
        lockedRect.current = buttonRef.current.getBoundingClientRect();
      }
    }
    setIsHovered(true);
  }, [disabled, hoverChildren]);

  const handleMouseLeave = useCallback(() => {
    if (hoverChildren !== undefined) {
      // Ignored — global mousemove owns exit detection.
      return;
    }
    setIsHovered(false);
    setIsClicked(false);
  }, [hoverChildren]);

  // Global mousemove: sole authority on hover state once hovered.
  // The exit zone = max(locked rect, live rect) + 3px buffer.
  // Nothing else can unhover — not mouseLeave, not re-entry mouseEnter.
  useEffect(() => {
    if (!isHovered || hoverChildren === undefined) return;

    const unhover = () => {
      lockedRect.current = null;
      setIsHovered(false);
      setIsClicked(false);
    };

    const onMouseMove = (e: MouseEvent) => {
      const exitRect = getExitRect();
      const inside = exitRect ? isInsideRect(e.clientX, e.clientY, exitRect) : false;

      if (!exitRect || !inside) {
        unhover();
      }
    };

    // Cursor left the page entirely — no more mousemove events coming
    const onDocumentLeave = () => { unhover(); };

    document.addEventListener('mousemove', onMouseMove);
    document.documentElement.addEventListener('mouseleave', onDocumentLeave);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.documentElement.removeEventListener('mouseleave', onDocumentLeave);
    };
  }, [isHovered, hoverChildren, getExitRect]);

  // Window resize invalidates captured rects — clean exit
  useEffect(() => {
    if (!isHovered || hoverChildren === undefined) return;
    const onResize = () => {
      lockedRect.current = null;
      setIsHovered(false);
      setIsClicked(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isHovered, hoverChildren]);

  return (
    <button
      ref={hoverChildren !== undefined ? buttonRef : undefined}
      onClick={handleClick}
      disabled={disabled}
      tabIndex={-1}
      data-settings-toggle={dataAttribute === 'settings-toggle' ? true : undefined}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      title={title}
      className={`${fullWidth ? 'w-full' : ''} px-3 py-2 font-mono rounded flex items-center justify-center gap-2 outline-none focus:outline-none select-none ${size === 'sm' ? 'text-xs font-bold' : 'font-extrabold'} ${disabled && !overrideColor ? 'opacity-50' : ''}${extraClassName ? ' ' + extraClassName : ''}`}
      style={{
        fontSize: size === 'sm' ? undefined : '14px',
        color: textColor,
        backgroundColor: getBackgroundColor(),
        border: `3px solid ${getBorderColor()}`,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => !disabled && setIsClicked(true)}
      onMouseUp={() => setIsClicked(false)}
    >
      {hoverChildren !== undefined && isHovered ? hoverChildren : children}
    </button>
  );
}

import { useRef, useCallback } from 'react';
import { isTouchInside } from '../utils';

interface MobileButtonProps {
  onActivate: () => void;
  style: React.CSSProperties;
  children: React.ReactNode;
  getStyle: (pressed: boolean) => React.CSSProperties;
  extraProps?: Record<string, unknown>;
}

export function MobileButton({ onActivate, children, getStyle, extraProps }: MobileButtonProps) {
  const btnRef = useRef<HTMLDivElement>(null);
  const engaged = useRef(false);
  const pressedStyle = useRef(getStyle(true));
  const normalStyle = useRef(getStyle(false));

  // Update cached styles on each render (parent color changes)
  pressedStyle.current = getStyle(true);
  normalStyle.current = getStyle(false);

  const applyStyle = useCallback((pressed: boolean) => {
    if (!btnRef.current) return;
    const s = pressed ? pressedStyle.current : normalStyle.current;
    Object.assign(btnRef.current.style, s);
  }, []);

  return (
    <div
      ref={btnRef}
      data-btn
      onTouchStart={(e) => {
        e.preventDefault();
        engaged.current = true;
        applyStyle(true);
      }}
      onTouchMove={(e) => {
        const inside = isTouchInside(e);
        engaged.current = inside;
        applyStyle(inside);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        if (engaged.current) onActivate();
        engaged.current = false;
        applyStyle(false);
      }}
      onTouchCancel={() => { engaged.current = false; applyStyle(false); }}
      style={getStyle(false)}
      {...extraProps}
    >
      {children}
    </div>
  );
}

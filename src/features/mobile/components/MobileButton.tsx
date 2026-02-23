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
  const shouldFire = useRef(false);
  const pressedStyle = useRef(getStyle(true));
  const normalStyle = useRef(getStyle(false));

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
      onTouchStart={() => { engaged.current = true; shouldFire.current = false; applyStyle(true); }}
      onTouchMove={(e) => {
        const inside = isTouchInside(e);
        engaged.current = inside;
        applyStyle(inside);
      }}
      onTouchEnd={() => { shouldFire.current = engaged.current; engaged.current = false; applyStyle(false); }}
      onClick={() => { if (shouldFire.current) { shouldFire.current = false; onActivate(); } }}
      onTouchCancel={() => { engaged.current = false; shouldFire.current = false; applyStyle(false); }}
      style={{ ...getStyle(false), touchAction: 'none' }}
      {...extraProps}
    >
      {children}
    </div>
  );
}

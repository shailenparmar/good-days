import { useRef, useState } from 'react';
import { isTouchInside } from '../utils';

interface MobileButtonProps {
  onActivate: () => void;
  style: React.CSSProperties;
  children: React.ReactNode;
  getStyle: (pressed: boolean) => React.CSSProperties;
  extraProps?: Record<string, unknown>;
}

export function MobileButton({ onActivate, children, getStyle, extraProps }: MobileButtonProps) {
  const [pressed, setPressed] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={btnRef}
      data-btn
      onTouchStart={(e) => { e.preventDefault(); setPressed(true); }}
      onTouchMove={(e) => { setPressed(isTouchInside(e)); }}
      onTouchEnd={(e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (touch && btnRef.current) {
          const rect = btnRef.current.getBoundingClientRect();
          if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            onActivate();
          }
        }
        setPressed(false);
      }}
      onTouchCancel={() => { setPressed(false); }}
      style={getStyle(pressed)}
      {...extraProps}
    >
      {children}
    </div>
  );
}

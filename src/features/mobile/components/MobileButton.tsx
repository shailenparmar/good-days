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
  const engaged = useRef(false);

  return (
    <div
      data-btn
      onTouchStart={(e) => { e.preventDefault(); engaged.current = true; setPressed(true); }}
      onTouchMove={(e) => { const inside = isTouchInside(e); engaged.current = inside; setPressed(inside); }}
      onTouchEnd={(e) => { e.preventDefault(); const touch = e.changedTouches[0]; if (touch) { const rect = e.currentTarget.getBoundingClientRect(); engaged.current = touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom; } if (engaged.current) onActivate(); engaged.current = false; setPressed(false); }}
      onTouchCancel={() => { engaged.current = false; setPressed(false); }}
      style={getStyle(pressed)}
      {...extraProps}
    >
      {children}
    </div>
  );
}

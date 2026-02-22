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
  const [dbg, setDbg] = useState('');

  return (
    <div
      data-btn
      onTouchStart={(e) => { e.preventDefault(); engaged.current = true; setPressed(true); setDbg('start'); }}
      onTouchMove={(e) => {
        const inside = isTouchInside(e);
        engaged.current = inside;
        setPressed(inside);
        setDbg(inside ? 'in' : 'out');
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        const wasEngaged = engaged.current;
        setDbg(wasEngaged ? 'FIRE' : 'MISS');
        if (wasEngaged) onActivate();
        engaged.current = false;
        setPressed(false);
      }}
      onTouchCancel={() => { engaged.current = false; setPressed(false); setDbg('cancel'); }}
      style={getStyle(pressed)}
      {...extraProps}
    >
      {children} <span style={{ fontSize: '10px', opacity: 0.5 }}>{dbg}</span>
    </div>
  );
}

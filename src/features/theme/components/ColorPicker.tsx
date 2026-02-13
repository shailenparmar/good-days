import { useRef, useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { streamingControlsRef } from '@shared/sync/streamingControlsRef';

interface ColorPickerProps {
  type: 'text' | 'background';
  part: 'sl' | 'hue';
}

export function ColorPicker({ type, part }: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Track active listeners for cleanup on unmount
  const listenersRef = useRef<{
    move: ((e: MouseEvent | TouchEvent) => void) | null;
    up: ((e?: MouseEvent | TouchEvent) => void) | null;
  }>({ move: null, up: null });
  const {
    hue, saturation, lightness,
    bgHue, bgSaturation, bgLightness,
    setHue, setSaturation, setLightness,
    setBgHue, setBgSaturation, setBgLightness,
    getColor, getBgColor,
    isLiveStreaming,
    setLocalDragging,
    incrementColorPickerDragCount, prePickerSnapshotRef,
  } = useTheme();
  const streamingControls = streamingControlsRef.current;

  const isText = type === 'text';
  const setHueValue = isText ? setHue : setBgHue;
  const setSat = isText ? setSaturation : setBgSaturation;
  const setLight = isText ? setLightness : setBgLightness;

  // Compute indicator role
  let role: 'idle' | 'alpha' | 'beta' | 'local-drag' = 'idle';
  if (isDragging) {
    role = 'local-drag';
  } else if (isLiveStreaming && streamingControls) {
    if (streamingControls.alpha.side === type) {
      role = 'alpha';
    } else if (streamingControls.beta?.side === type) {
      role = 'beta';
    }
  }

  // Indicator sizes based on role (idle=1x, beta=2x, alpha/drag=4x)
  const dotSize = (role === 'alpha' || role === 'local-drag') ? 32 : 16;
  const needleHeight = (role === 'alpha' || role === 'local-drag') ? 16 : role === 'beta' ? 8 : 4;
  // SL dot beats everything when active (local drag or live alpha)
  const slZIndex = part === 'sl' && (role === 'local-drag' || role === 'alpha') ? 10 : 2;

  // Cleanup listeners on unmount (prevents memory leak if unmounted mid-drag)
  useEffect(() => {
    return () => {
      if (listenersRef.current.move) {
        document.removeEventListener('mousemove', listenersRef.current.move as EventListener);
        document.removeEventListener('touchmove', listenersRef.current.move as EventListener);
      }
      if (listenersRef.current.up) {
        document.removeEventListener('mouseup', listenersRef.current.up as EventListener);
        document.removeEventListener('touchend', listenersRef.current.up as EventListener);
        document.removeEventListener('touchcancel', listenersRef.current.up as EventListener);
      }
    };
  }, []);

  const startDrag = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setLocalDragging(true);

    // Snapshot current colors before any updates (for undo)
    prePickerSnapshotRef.current = {
      hue, sat: saturation, light: lightness,
      bgHue, bgSat: bgSaturation, bgLight: bgLightness,
    };
    incrementColorPickerDragCount();

    if (part === 'sl') {
      const updateColor = (cx: number, cy: number) => {
        if (!pickerRef.current) return;
        const rect = pickerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(cx - rect.left, rect.width));
        const y = Math.max(0, Math.min(cy - rect.top, rect.height));
        setSat(Math.round((x / rect.width) * 100));
        setLight(Math.round(100 - (y / rect.height) * 100));
      };

      updateColor(clientX, clientY);

      const handleMove = (e: MouseEvent | TouchEvent) => {
        const pt = 'touches' in e ? e.touches[0] : e;
        if (pt) updateColor(pt.clientX, pt.clientY);
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove as EventListener);
        document.removeEventListener('mouseup', handleUp);
        document.removeEventListener('touchmove', handleMove as EventListener);
        document.removeEventListener('touchend', handleUp);
        document.removeEventListener('touchcancel', handleUp);
        listenersRef.current = { move: null, up: null };
        setIsDragging(false);
        setLocalDragging(false);
      };

      listenersRef.current = { move: handleMove, up: handleUp };
      document.addEventListener('mousemove', handleMove as EventListener);
      document.addEventListener('mouseup', handleUp);
      document.addEventListener('touchmove', handleMove as EventListener, { passive: false });
      document.addEventListener('touchend', handleUp);
      document.addEventListener('touchcancel', handleUp);
    } else {
      const updateHue = (cy: number) => {
        if (!pickerRef.current) return;
        const rect = pickerRef.current.getBoundingClientRect();
        const y = Math.max(0, Math.min(cy - rect.top, rect.height));
        setHueValue(Math.round((1 - y / rect.height) * 360));
      };

      updateHue(clientY);

      const handleMove = (e: MouseEvent | TouchEvent) => {
        const pt = 'touches' in e ? e.touches[0] : e;
        if (pt) updateHue(pt.clientY);
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove as EventListener);
        document.removeEventListener('mouseup', handleUp);
        document.removeEventListener('touchmove', handleMove as EventListener);
        document.removeEventListener('touchend', handleUp);
        document.removeEventListener('touchcancel', handleUp);
        listenersRef.current = { move: null, up: null };
        setIsDragging(false);
        setLocalDragging(false);
      };

      listenersRef.current = { move: handleMove, up: handleUp };
      document.addEventListener('mousemove', handleMove as EventListener);
      document.addEventListener('mouseup', handleUp);
      document.addEventListener('touchmove', handleMove as EventListener, { passive: false });
      document.addEventListener('touchend', handleUp);
      document.addEventListener('touchcancel', handleUp);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    startDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) startDrag(touch.clientX, touch.clientY);
  };

  // CSS var expressions for indicator positions — static strings that update
  // via CSS vars during streaming (no React re-render needed)
  const needleTop = isText ? 'calc(var(--th-p) * 1%)' : 'calc(var(--bh-p) * 1%)';
  const dotLeft = isText ? 'calc(var(--ts-p) * 1%)' : 'calc(var(--bs-p) * 1%)';
  const dotTop = isText ? 'calc(var(--tl-p) * 1%)' : 'calc(var(--bl-p) * 1%)';

  if (part === 'hue') {
    return (
      <div
        ref={pickerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="relative rounded"
        style={{
          width: '100%',
          aspectRatio: '1',
          overflow: 'hidden',
          zIndex: isDragging ? 10 : 1,
          background: 'linear-gradient(to top, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))',
        }}
      >
        {/* Hue needle */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: 0,
            right: 0,
            top: needleTop,
            height: `${needleHeight}px`,
            transform: 'translateY(-50%)',
            backgroundColor: 'black',
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={pickerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className="relative rounded"
      style={{
        width: '100%',
        aspectRatio: '1',
        overflow: 'visible',
        zIndex: slZIndex,
        background: isText
          ? 'linear-gradient(to bottom, white, transparent 50%), linear-gradient(to top, black, transparent 50%), linear-gradient(to right, hsl(var(--h), 0%, 50%), hsl(var(--h), 100%, 50%))'
          : 'linear-gradient(to bottom, white, transparent 50%), linear-gradient(to top, black, transparent 50%), linear-gradient(to right, hsl(var(--bh), 0%, 50%), hsl(var(--bh), 100%, 50%))',
      }}
    >
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          left: dotLeft,
          top: dotTop,
          transform: 'translate(-50%, -50%)',
          backgroundColor: isText ? getBgColor() : getColor(),
        }}
      />
    </div>
  );
}

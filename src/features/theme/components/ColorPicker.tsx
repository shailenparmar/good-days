import { useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

interface ColorPickerProps {
  type: 'text' | 'background';
  vertical?: boolean;
  huePosition?: 'left' | 'right';
  height?: number;
}

export function ColorPicker({ type, vertical, huePosition, height }: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  // Track active listeners for cleanup on unmount
  const listenersRef = useRef<{ move: ((e: MouseEvent) => void) | null; up: (() => void) | null }>({ move: null, up: null });
  const {
    hue, saturation, lightness,
    bgHue, bgSaturation, bgLightness,
    setHue, setSaturation, setLightness,
    setBgHue, setBgSaturation, setBgLightness,
    getColor, getBgColor,
  } = useTheme();

  const isText = type === 'text';
  const currentHue = isText ? hue : bgHue;
  const currentSat = isText ? saturation : bgSaturation;
  const currentLight = isText ? lightness : bgLightness;
  const setHueValue = isText ? setHue : setBgHue;
  const setSat = isText ? setSaturation : setBgSaturation;
  const setLight = isText ? setLightness : setBgLightness;

  // Cleanup listeners on unmount (prevents memory leak if unmounted mid-drag)
  useEffect(() => {
    return () => {
      if (listenersRef.current.move) {
        document.removeEventListener('mousemove', listenersRef.current.move);
      }
      if (listenersRef.current.up) {
        document.removeEventListener('mouseup', listenersRef.current.up);
      }
    };
  }, []);

  const handlePickerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const updateColor = (clientX: number, clientY: number) => {
      if (!pickerRef.current) return;
      const rect = pickerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

      const newSat = (x / rect.width) * 100;
      const newLight = 100 - (y / rect.height) * 100;

      setSat(Math.round(newSat));
      setLight(Math.round(newLight));
    };

    updateColor(e.clientX, e.clientY);

    const handleMouseMove = (e: MouseEvent) => {
      updateColor(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      listenersRef.current = { move: null, up: null };
    };

    // Store refs for cleanup
    listenersRef.current = { move: handleMouseMove, up: handleMouseUp };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const thumbColor = isText ? getColor() : getBgColor();
  const thumbStyle = `
    .hue-slider-${type}::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${thumbColor};
      border: 2px solid ${thumbColor};
    }
    .hue-slider-${type}::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${thumbColor};
      border: 2px solid ${thumbColor};
    }
  `;

  const hueSlider = (
    <input
      type="range"
      min="0"
      max="360"
      value={currentHue}
      onChange={(e) => setHueValue(Number(e.target.value))}
      onMouseUp={(e) => e.currentTarget.blur()}
      onKeyDown={(e) => e.preventDefault()}
      tabIndex={-1}
      className={`rounded appearance-none hue-slider-${type}`}
      style={vertical ? {
        writingMode: 'vertical-lr',
        direction: 'rtl',
        width: '20px',
        height: '100%',
        background: 'linear-gradient(to top, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))',
      } : {
        width: '100%',
        height: '8px',
        background: 'linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))',
      }}
    />
  );

  const slSquare = (
    <div
      ref={pickerRef}
      onMouseDown={handlePickerMouseDown}
      className="relative rounded"
      style={{
        ...(vertical ? { flex: 1, height: '100%' } : { width: '100%', height: '80px' }),
        background: `linear-gradient(to bottom, white, transparent 50%), linear-gradient(to top, black, transparent 50%), linear-gradient(to right, hsl(${currentHue}, 0%, 50%), hsl(${currentHue}, 100%, 50%))`,
      }}
    >
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '16px',
          height: '16px',
          left: `${currentSat}%`,
          top: `${100 - currentLight}%`,
          transform: 'translate(-50%, -50%)',
          backgroundColor: vertical
            ? (isText ? getColor() : getBgColor())
            : (isText ? getBgColor() : getColor()),
        }}
      />
    </div>
  );

  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'row', gap: '4px', height: height ?? 192, flex: 1, minWidth: 0 }}>
        <style>{thumbStyle}</style>
        {huePosition === 'left' ? (
          <>{hueSlider}{slSquare}</>
        ) : (
          <>{slSquare}{hueSlider}</>
        )}
      </div>
    );
  }

  return (
    <div>
      <style>{thumbStyle}</style>
      <div className="mb-1">
        {hueSlider}
      </div>
      <div>
        {slSquare}
      </div>
    </div>
  );
}

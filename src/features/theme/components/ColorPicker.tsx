import { useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

interface ColorPickerProps {
  type: 'text' | 'background';
}

export function ColorPicker({ type }: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
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
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div>
      <div className="text-xs font-mono font-bold mb-1" style={{ color: getColor() }}>
        {type}
      </div>

      {/* Hue slider */}
      <div className="mb-2">
        <style>
          {`
            .hue-slider-${type}::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: ${getColor()};
              cursor: pointer;
              border: 2px solid ${getColor()};
              box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
            }
            .hue-slider-${type}::-moz-range-thumb {
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: ${getColor()};
              cursor: pointer;
              border: 2px solid ${getColor()};
              box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
            }
          `}
        </style>
        <input
          type="range"
          min="0"
          max="360"
          value={currentHue}
          onChange={(e) => setHueValue(Number(e.target.value))}
          className={`w-full h-2 rounded appearance-none cursor-pointer hue-slider-${type}`}
          style={{
            background: 'linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))'
          }}
        />
      </div>

      {/* Saturation/Lightness picker */}
      <div>
        <div
          ref={pickerRef}
          onMouseDown={handlePickerMouseDown}
          className="relative w-full h-20 rounded cursor-crosshair"
          style={{
            background: `linear-gradient(to bottom, white, transparent 50%), linear-gradient(to top, black, transparent 50%), linear-gradient(to right, hsl(${currentHue}, 0%, 50%), hsl(${currentHue}, 100%, 50%))`
          }}
        >
          {/* Dot indicator */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: '16px',
              height: '16px',
              left: `${currentSat}%`,
              top: `${100 - currentLight}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: isText ? getBgColor() : getColor(),
            }}
          />
        </div>
      </div>
    </div>
  );
}

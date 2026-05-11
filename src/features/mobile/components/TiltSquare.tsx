interface CornerBracketsProps {
  size: number;
  color: string;
  showLabels?: boolean;
}

const cornerLen = 32;
const cornerW = 4;

export function CornerBrackets({ size: _size, color, showLabels }: CornerBracketsProps) {
  const labelStyle: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', pointerEvents: 'none', position: 'absolute', color, transform: 'translate(-50%, -50%)' };
  return (
    <>
      {/* Top-left - offset outward so L corners frame the pure square */}
      <div style={{ position: 'absolute', top: `${-cornerW}px`, left: `${-cornerW}px`, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', top: `${-cornerW}px`, left: `${-cornerW}px`, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Top-right */}
      <div style={{ position: 'absolute', top: `${-cornerW}px`, right: `${-cornerW}px`, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', top: `${-cornerW}px`, right: `${-cornerW}px`, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Bottom-left */}
      <div style={{ position: 'absolute', bottom: `${-cornerW}px`, left: `${-cornerW}px`, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', bottom: `${-cornerW}px`, left: `${-cornerW}px`, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Bottom-right */}
      <div style={{ position: 'absolute', bottom: `${-cornerW}px`, right: `${-cornerW}px`, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', bottom: `${-cornerW}px`, right: `${-cornerW}px`, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Edge midpoint labels - only in picker, fully outside the square */}
      {showLabels && (
        <>
          <span style={{ ...labelStyle, top: 0, left: '50%', transform: 'translate(-50%, -100%)' }}>light</span>
          <span style={{ ...labelStyle, top: 'auto', bottom: 0, left: '50%', transform: 'translate(-50%, 100%)' }}>dark</span>
          <span style={{ ...labelStyle, left: 0, top: '50%', transform: 'translate(-100%, -50%)' }}>muted</span>
          <span style={{ ...labelStyle, right: 0, left: 'auto', top: '50%', transform: 'translate(100%, -50%)' }}>vivid</span>
        </>
      )}
    </>
  );
}

// Dot marker helper - filled circle (LIVE, actively adjusting)
export function DotMarker({ posX, posY, color, travel, size = 40, className }: { posX: number; posY: number; color: string; travel: number; size?: number; className?: string }) {
  return (
    <div className={className} style={{
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      backgroundColor: color,
      left: '50%',
      top: '50%',
      transform: `translate(calc(-50% + ${posX * travel}px), calc(-50% + ${posY * travel}px))`,
      willChange: 'transform',
      pointerEvents: 'none',
    }} />
  );
}

// Hollow circle marker - outline circle (cursor/target during seeking, home calibration)
export function HollowCircleMarker({ posX, posY, color, travel, size = 40, borderWidth = 4 }: { posX: number; posY: number; color: string; travel: number; size?: number; borderWidth?: number }) {
  return (
    <div style={{
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      border: `${borderWidth}px solid ${color}`,
      boxSizing: 'border-box',
      left: '50%',
      top: '50%',
      transform: `translate(calc(-50% + ${posX * travel}px), calc(-50% + ${posY * travel}px))`,
      willChange: 'transform',
      pointerEvents: 'none',
    }} />
  );
}

// Tilt square - two-dot system
// Home: tilt feedback dot
// Picker: active dot (moves with tilt) + locked hollow circle (other color)
interface TiltSquareProps {
  size: number;
  showLabels?: boolean;
  colors: { hue: number; sat: number; light: number; bgHue: number; bgSat: number; bgLight: number };
  editing: 'adjusting' | null;
  activeDot: 'text' | 'bg';
  tiltX: number;
  tiltY: number;
  textColor: string;
  homeDotColor?: string;
  homeDotClassName?: string;
}

export function TiltSquare({ size, showLabels, colors, editing, activeDot, tiltX, tiltY, textColor, homeDotColor, homeDotClassName }: TiltSquareProps) {
  const dotTravel = (size / 2) - 20;

  // Positions derived from color values (sat→X, light→Y inverted)
  const textPosX = (colors.sat - 50) / 50;
  const textPosY = -(colors.light - 50) / 50;
  const bgPosX = (colors.bgSat - 50) / 50;
  const bgPosY = -(colors.bgLight - 50) / 50;

  const isHome = editing === null;
  const isPickerScreen = editing === 'adjusting';

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <CornerBrackets size={size} color={textColor} showLabels={showLabels} />

      {isHome && (
        <>
          {/* Single filled dot - tilt feedback */}
          <DotMarker posX={tiltX} posY={tiltY} color={homeDotColor ?? textColor} travel={dotTravel} className={homeDotClassName} />
        </>
      )}

      {isPickerScreen && (
        <>
          {/* Filled dot = active (being controlled), hollow circle = inactive */}
          {activeDot === 'text' ? (
            <>
              <DotMarker posX={textPosX} posY={textPosY} color={textColor} travel={dotTravel} />
              <HollowCircleMarker posX={bgPosX} posY={bgPosY} color={textColor} travel={dotTravel} />
            </>
          ) : (
            <>
              <DotMarker posX={bgPosX} posY={bgPosY} color={textColor} travel={dotTravel} />
              <HollowCircleMarker posX={textPosX} posY={textPosY} color={textColor} travel={dotTravel} />
            </>
          )}
        </>
      )}
    </div>
  );
}

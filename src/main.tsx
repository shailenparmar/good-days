import { StrictMode, useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

type ColorState = {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
};

function parseColorInput(input: string) {
  const trimmed = input.trim().toLowerCase();
  const hexMatch = trimmed.match(/#([0-9a-f]{6})/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { type: 'hsl' as const, h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  const hslMatch = trimmed.match(/(?:(txt|bg):\s*)?(\d+),\s*(\d+)%?,\s*(\d+)%?/);
  if (hslMatch) {
    const type = hslMatch[1] as 'txt' | 'bg' | undefined;
    return { type: type || 'hsl' as const, h: parseInt(hslMatch[2]), s: parseInt(hslMatch[3]), l: parseInt(hslMatch[4]) };
  }
  return null;
}

function MobileScreen() {
  const [colors, setColors] = useState<ColorState>(() => {
    const saved = localStorage.getItem('mobileColors');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    return { hue: 175, sat: 100, light: 21, bgHue: 84, bgSat: 100, bgLight: 88 };
  });

  const [editing, setEditing] = useState<'text' | 'bg' | null>(null);

  // Refs for tracking orientation baseline and current values
  const baselineBeta = useRef(0);
  const baselineGamma = useRef(0);
  const baselineSat = useRef(50);
  const baselineLight = useRef(50);

  // Ref for the hue slider area
  const sliderRef = useRef<HTMLDivElement>(null);

  // Track if orientation permission granted
  const [orientationGranted, setOrientationGranted] = useState(false);

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  // Persist colors
  useEffect(() => {
    localStorage.setItem('mobileColors', JSON.stringify(colors));
  }, [colors]);

  // Update meta theme-color
  useEffect(() => {
    const hexColor = hslToHex(colors.bgHue, colors.bgSat, colors.bgLight);
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = hexColor;
    document.head.appendChild(meta);
    document.body.style.setProperty('background-color', bgColor, 'important');
    document.documentElement.style.setProperty('background-color', bgColor, 'important');
  }, [bgColor, colors.bgHue, colors.bgSat, colors.bgLight]);

  // Request orientation permission on first interaction
  const ensureOrientationPermission = async () => {
    if (orientationGranted) return true;

    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result === 'granted') {
          setOrientationGranted(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    // Non-iOS doesn't need permission
    setOrientationGranted(true);
    return true;
  };

  // Orientation handler - updates sat/light based on tilt from baseline
  useEffect(() => {
    if (!editing) return;

    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      const betaDelta = beta - baselineBeta.current;
      const gammaDelta = gamma - baselineGamma.current;

      // ±45° maps to ±50 change
      const maxTilt = 45;
      const satChange = (gammaDelta / maxTilt) * 50;
      const lightChange = -(betaDelta / maxTilt) * 50; // negative: tilt forward = darker

      const newSat = Math.max(0, Math.min(100, Math.round(baselineSat.current + satChange)));
      const newLight = Math.max(5, Math.min(95, Math.round(baselineLight.current + lightChange)));

      setColors(prev => {
        if (editing === 'text') {
          return { ...prev, sat: newSat, light: newLight };
        } else {
          return { ...prev, bgSat: newSat, bgLight: newLight };
        }
      });
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [editing]);

  // Touch handlers for the color buttons
  const handlePointerDown = async (which: 'text' | 'bg', e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (navigator.vibrate) navigator.vibrate(10);

    // Request permission (will be instant if already granted)
    await ensureOrientationPermission();

    // Capture current orientation as baseline
    const captureBaseline = (ev: DeviceOrientationEvent) => {
      baselineBeta.current = ev.beta ?? 0;
      baselineGamma.current = ev.gamma ?? 0;
      window.removeEventListener('deviceorientation', captureBaseline);
    };
    window.addEventListener('deviceorientation', captureBaseline, { once: true });

    // Capture current sat/light as baseline
    if (which === 'text') {
      baselineSat.current = colors.sat;
      baselineLight.current = colors.light;
    } else {
      baselineSat.current = colors.bgSat;
      baselineLight.current = colors.bgLight;
    }

    setEditing(which);
  };

  // Global pointer move - updates hue based on Y position in slider
  useEffect(() => {
    if (!editing) return;

    const handleMove = (e: PointerEvent) => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const relY = (e.clientY - rect.top) / rect.height;
      const clampedY = Math.max(0, Math.min(1, relY));
      const newHue = Math.round(clampedY * 360);

      setColors(prev => {
        if (editing === 'text') {
          return { ...prev, hue: newHue };
        } else {
          return { ...prev, bgHue: newHue };
        }
      });
    };

    const handleUp = () => {
      if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
      setEditing(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [editing]);

  // Copy handler
  const handleCopy = async () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const text = `txt: ${colors.hue}, ${colors.sat}%, ${colors.light}%\nbg: ${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%`;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  // Paste handler
  const handlePaste = async () => {
    if (navigator.vibrate) navigator.vibrate(10);
    try {
      const text = await navigator.clipboard.readText();
      let txtH = colors.hue, txtS = colors.sat, txtL = colors.light;
      let bgH = colors.bgHue, bgS = colors.bgSat, bgL = colors.bgLight;
      let found = false;
      for (const line of text.split('\n')) {
        const parsed = parseColorInput(line);
        if (parsed) {
          found = true;
          if (parsed.type === 'txt') { txtH = parsed.h; txtS = parsed.s; txtL = parsed.l; }
          else if (parsed.type === 'bg') { bgH = parsed.h; bgS = parsed.s; bgL = parsed.l; }
          else { txtH = parsed.h; txtS = parsed.s; txtL = parsed.l; }
        }
      }
      if (found) setColors({ hue: txtH, sat: txtS, light: txtL, bgHue: bgH, bgSat: bgS, bgLight: bgL });
    } catch { /* ignore */ }
  };

  const currentHue = editing === 'text' ? colors.hue : colors.bgHue;
  const currentSat = editing === 'text' ? colors.sat : colors.bgSat;
  const currentLight = editing === 'text' ? colors.light : colors.bgLight;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgColor,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* Top half: good days + copy/paste (always visible, updates live) */}
      <div
        style={{
          flex: editing ? '0 0 50%' : '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
        }}
      >
        <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '28px' }}>
          good
        </span>
        <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '28px' }}>
          days
        </span>

        {/* Copy/paste split button */}
        <div style={{ display: 'flex', marginTop: '24px' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleCopy(); }}
            style={{
              padding: '8px 20px',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '14px',
              backgroundColor: 'transparent',
              border: `3px solid ${textColor}`,
              borderRight: `1px solid ${textColor}`,
              borderRadius: '8px 0 0 8px',
              color: textColor,
              touchAction: 'none',
            }}
          >
            copy
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handlePaste(); }}
            style={{
              padding: '8px 20px',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '14px',
              backgroundColor: 'transparent',
              border: `3px solid ${textColor}`,
              borderLeft: `1px solid ${textColor}`,
              borderRadius: '0 8px 8px 0',
              color: textColor,
              touchAction: 'none',
            }}
          >
            paste
          </button>
        </div>
      </div>

      {/* Bottom section: either text/bg buttons OR hue slider */}
      {!editing ? (
        <div style={{ padding: '0 40px 60px', display: 'flex' }}>
          <button
            onPointerDown={(e) => handlePointerDown('text', e)}
            style={{
              flex: 1,
              padding: '16px 0',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '18px',
              backgroundColor: 'transparent',
              border: `4px solid ${textColor}`,
              borderRight: `2px solid ${textColor}`,
              borderRadius: '12px 0 0 12px',
              color: textColor,
              touchAction: 'none',
            }}
          >
            text
          </button>
          <button
            onPointerDown={(e) => handlePointerDown('bg', e)}
            style={{
              flex: 1,
              padding: '16px 0',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '18px',
              backgroundColor: 'transparent',
              border: `4px solid ${textColor}`,
              borderLeft: `2px solid ${textColor}`,
              borderRadius: '0 12px 12px 0',
              color: textColor,
              touchAction: 'none',
            }}
          >
            background
          </button>
        </div>
      ) : (
        <div
          ref={sliderRef}
          style={{
            flex: '0 0 50%',
            position: 'relative',
            background: `linear-gradient(to bottom,
              hsl(0, 100%, 50%),
              hsl(60, 100%, 50%),
              hsl(120, 100%, 50%),
              hsl(180, 100%, 50%),
              hsl(240, 100%, 50%),
              hsl(300, 100%, 50%),
              hsl(360, 100%, 50%)
            )`,
          }}
        >
          {/* Horizontal indicator */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(currentHue / 360) * 100}%`,
              height: '4px',
              backgroundColor: 'white',
              boxShadow: '0 0 8px rgba(0,0,0,0.5)',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          {/* Values label */}
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              fontSize: '14px',
              pointerEvents: 'none',
            }}
          >
            {editing}: h{currentHue} s{currentSat} l{currentLight}
          </div>
          {/* Hint */}
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '12px',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            drag ↕ hue • tilt ↔ sat • tilt ↕ light
          </div>
        </div>
      )}
    </div>
  );
}

if (isMobile) {
  createRoot(document.getElementById('root')!).render(<MobileScreen />);
} else {
  import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}

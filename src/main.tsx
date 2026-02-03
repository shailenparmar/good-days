import { StrictMode, useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Check mobile FIRST, before loading heavy imports
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Convert HSL to hex for theme-color (Safari prefers hex)
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

// Color state type
type ColorState = {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
};

// Parse color values from pasted text (same format as powerstat)
function parseColorInput(input: string) {
  const trimmed = input.trim().toLowerCase();

  // Try HEX format: #rrggbb
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

  // Try HSL format: "txt: 120, 50%, 60%" or "bg: 200, 80%, 90%" or just "120, 50%, 60%"
  const hslMatch = trimmed.match(/(?:(txt|bg):\s*)?(\d+),\s*(\d+)%?,\s*(\d+)%?/);
  if (hslMatch) {
    const type = hslMatch[1] as 'txt' | 'bg' | undefined;
    return { type: type || 'hsl' as const, h: parseInt(hslMatch[2]), s: parseInt(hslMatch[3]), l: parseInt(hslMatch[4]) };
  }

  return null;
}

// Simple mobile component with accelerometer color picker
function MobileScreen() {
  const [colors, setColors] = useState<ColorState>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('mobileColors');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fall through to default
      }
    }
    return {
      hue: 175, sat: 100, light: 21,
      bgHue: 84, bgSat: 100, bgLight: 88
    };
  });

  // Which color is being edited: 'text' | 'bg' | null
  const [editing, setEditing] = useState<'text' | 'bg' | null>(null);

  // Track the starting touch Y position and current hue for smooth dragging
  const touchStartY = useRef(0);
  const startHue = useRef(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Accelerometer baseline (captured at touch start)
  const baselineOrientation = useRef({ beta: 0, gamma: 0 });
  const [liveOrientation, setLiveOrientation] = useState({ beta: 0, gamma: 0 });

  // Track if we have orientation permission
  const [hasOrientationPermission, setHasOrientationPermission] = useState(false);

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  // Save colors to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('mobileColors', JSON.stringify(colors));
  }, [colors]);

  // Update theme-color meta tag and body background
  useEffect(() => {
    try {
      const hexColor = hslToHex(colors.bgHue, colors.bgSat, colors.bgLight);
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.content = hexColor;
      document.head.appendChild(newMeta);
      document.body.style.setProperty('background-color', bgColor, 'important');
      document.documentElement.style.setProperty('background-color', bgColor, 'important');
    } catch {
      // Ignore errors
    }
  }, [bgColor, colors.bgHue, colors.bgSat, colors.bgLight]);

  // Request device orientation permission (needed for iOS 13+)
  const requestOrientationPermission = useCallback(async () => {
    // Check if DeviceOrientationEvent exists and has requestPermission (iOS 13+)
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const permission = await DOE.requestPermission();
        if (permission === 'granted') {
          setHasOrientationPermission(true);
          return true;
        }
      } catch {
        return false;
      }
    } else {
      // Non-iOS or older iOS - permission not needed
      setHasOrientationPermission(true);
      return true;
    }
    return false;
  }, []);

  // Handle device orientation changes
  useEffect(() => {
    if (!editing || !hasOrientationPermission) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;   // Front-back tilt: -180 to 180
      const gamma = e.gamma ?? 0; // Left-right tilt: -90 to 90
      setLiveOrientation({ beta, gamma });

      // Calculate deviation from baseline
      const betaDelta = beta - baselineOrientation.current.beta;
      const gammaDelta = gamma - baselineOrientation.current.gamma;

      // Map tilt to saturation and lightness
      // Beta (front-back) controls lightness: tilt forward = darker, back = lighter
      // Gamma (left-right) controls saturation: tilt left = less, right = more
      // Range: ±45° maps to full range (0-100)
      const maxTilt = 45;

      // Lightness: baseline ± delta, clamped to 5-95
      const lightDelta = (betaDelta / maxTilt) * 50;
      const newLight = Math.max(5, Math.min(95, 50 - lightDelta));

      // Saturation: baseline ± delta, clamped to 0-100
      const satDelta = (gammaDelta / maxTilt) * 50;
      const newSat = Math.max(0, Math.min(100, 50 + satDelta));

      setColors(prev => {
        if (editing === 'text') {
          return { ...prev, sat: Math.round(newSat), light: Math.round(newLight) };
        } else {
          return { ...prev, bgSat: Math.round(newSat), bgLight: Math.round(newLight) };
        }
      });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [editing, hasOrientationPermission]);

  // Handle touch start on a color button
  const handleTouchStart = async (which: 'text' | 'bg', e: React.TouchEvent) => {
    e.preventDefault();

    // Request permission if needed
    if (!hasOrientationPermission) {
      const granted = await requestOrientationPermission();
      if (!granted) {
        // Fall back to random on tap if no accelerometer
        if (navigator.vibrate) navigator.vibrate(10);
        setColors(prev => {
          if (which === 'text') {
            return { ...prev, hue: Math.floor(Math.random() * 360), sat: Math.floor(Math.random() * 101), light: Math.floor(Math.random() * 101) };
          } else {
            return { ...prev, bgHue: Math.floor(Math.random() * 360), bgSat: Math.floor(Math.random() * 101), bgLight: Math.floor(Math.random() * 101) };
          }
        });
        return;
      }
    }

    if (navigator.vibrate) navigator.vibrate(10);

    // Capture baseline orientation
    baselineOrientation.current = { ...liveOrientation };

    // Store touch start position
    touchStartY.current = e.touches[0].clientY;
    startHue.current = which === 'text' ? colors.hue : colors.bgHue;

    setEditing(which);
  };

  // Handle touch move (controls hue via vertical position)
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!editing || !sliderRef.current) return;

    const touch = e.touches[0];
    const slider = sliderRef.current;
    const rect = slider.getBoundingClientRect();

    // Calculate position within slider (0 at top, 1 at bottom)
    const relativeY = (touch.clientY - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relativeY));

    // Map to hue (0-360)
    const newHue = Math.round(clampedY * 360);

    setColors(prev => {
      if (editing === 'text') {
        return { ...prev, hue: newHue };
      } else {
        return { ...prev, bgHue: newHue };
      }
    });
  }, [editing]);

  // Handle touch end (lock the color)
  const handleTouchEnd = useCallback(() => {
    if (editing && navigator.vibrate) navigator.vibrate([5, 30, 5]);
    setEditing(null);
  }, [editing]);

  // Add global touch listeners when editing
  useEffect(() => {
    if (!editing) return;

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [editing, handleTouchMove, handleTouchEnd]);

  // Current hue being edited (for indicator position)
  const currentHue = editing === 'text' ? colors.hue : colors.bgHue;

  // Copy colors to clipboard
  const handleCopy = async () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const text = `txt: ${colors.hue}, ${colors.sat}%, ${colors.light}%\nbg: ${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access denied
    }
  };

  // Paste colors from clipboard
  const handlePaste = async () => {
    if (navigator.vibrate) navigator.vibrate(10);
    try {
      const text = await navigator.clipboard.readText();
      let txtH = colors.hue, txtS = colors.sat, txtL = colors.light;
      let bgH = colors.bgHue, bgS = colors.bgSat, bgL = colors.bgLight;
      let foundAny = false;

      const lines = text.split('\n');
      for (const line of lines) {
        const parsed = parseColorInput(line);
        if (parsed) {
          foundAny = true;
          if (parsed.type === 'txt') {
            txtH = parsed.h; txtS = parsed.s; txtL = parsed.l;
          } else if (parsed.type === 'bg') {
            bgH = parsed.h; bgS = parsed.s; bgL = parsed.l;
          } else {
            // Plain HSL - apply to text by default
            txtH = parsed.h; txtS = parsed.s; txtL = parsed.l;
          }
        }
      }

      if (foundAny) {
        setColors({ hue: txtH, sat: txtS, light: txtL, bgHue: bgH, bgSat: bgS, bgLight: bgL });
      }
    } catch {
      // Clipboard access denied or empty
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgColor,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      {/* Top section: "good days" title */}
      <div
        style={{
          flex: editing ? '0 0 50%' : '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: editing ? 'none' : 'flex 0.2s ease-out',
        }}
      >
        <p style={{
          color: textColor,
          fontFamily: 'monospace',
          fontWeight: 800,
          fontSize: editing ? '32px' : '28px',
          margin: 0,
          transition: 'font-size 0.2s ease-out',
        }}>
          good
        </p>
        <p style={{
          color: textColor,
          fontFamily: 'monospace',
          fontWeight: 800,
          fontSize: editing ? '32px' : '28px',
          margin: '4px 0 0 0',
          transition: 'font-size 0.2s ease-out',
        }}>
          days
        </p>
        {/* Copy/Paste split button - only visible when not editing */}
        {!editing && (
          <div style={{
            display: 'flex',
            marginTop: '32px',
          }}>
            <button
              onClick={handleCopy}
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
              }}
            >
              copy
            </button>
            <button
              onClick={handlePaste}
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
              }}
            >
              paste
            </button>
          </div>
        )}
      </div>

      {/* Bottom section: either split button or hue slider */}
      {!editing ? (
        // Split button: text | background
        <div style={{
          padding: '0 40px 60px 40px',
          display: 'flex',
        }}>
          <button
            onTouchStart={(e) => handleTouchStart('text', e)}
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
            }}
          >
            text
          </button>
          <button
            onTouchStart={(e) => handleTouchStart('bg', e)}
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
            }}
          >
            background
          </button>
        </div>
      ) : (
        // Hue slider (bottom 50% of screen)
        <div
          ref={sliderRef}
          style={{
            flex: '0 0 50%',
            position: 'relative',
            background: 'linear-gradient(to bottom, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))',
          }}
        >
          {/* Horizontal indicator line */}
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
          {/* Label showing current values */}
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
            {editing}: h{currentHue} s{editing === 'text' ? colors.sat : colors.bgSat} l{editing === 'text' ? colors.light : colors.bgLight}
          </div>
          {/* Tilt hint */}
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
  // Load full app only on desktop
  import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}

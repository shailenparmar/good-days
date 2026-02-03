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
  // Color state
  const [colors, setColors] = useState<ColorState>(() => {
    const saved = localStorage.getItem('mobileColors');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    return { hue: 175, sat: 100, light: 21, bgHue: 84, bgSat: 100, bgLight: 88 };
  });

  // Which color is being edited (null = not editing)
  const [editing, setEditing] = useState<'text' | 'bg' | null>(null);

  // Show copy/paste buttons after releasing from editing
  const [showCopyPaste, setShowCopyPaste] = useState(false);

  // Track if we need to request orientation permission (iOS)
  const [needsPermission, setNeedsPermission] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Refs for baseline values when editing starts
  const baseline = useRef({ beta: 0, gamma: 0, sat: 50, light: 50 });

  // Ref to track editing state in event handlers (avoids stale closure)
  const editingRef = useRef<'text' | 'bg' | null>(null);

  // Ref for the slider area
  const sliderRef = useRef<HTMLDivElement>(null);

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  // Keep editingRef in sync
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  // Persist colors
  useEffect(() => {
    localStorage.setItem('mobileColors', JSON.stringify(colors));
  }, [colors]);

  // Update theme-color meta
  useEffect(() => {
    const hex = hslToHex(colors.bgHue, colors.bgSat, colors.bgLight);
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = hex;
    document.head.appendChild(meta);
    document.body.style.setProperty('background-color', bgColor, 'important');
    document.documentElement.style.setProperty('background-color', bgColor, 'important');
  }, [bgColor, colors.bgHue, colors.bgSat, colors.bgLight]);

  // Lock to portrait orientation on mount
  useEffect(() => {
    // Try Screen Orientation API (works on Android Chrome, some iOS)
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation?.lock) {
      orientation.lock('portrait').catch(() => {
        // Silently fail - not supported or not allowed
      });
    }
  }, []);

  // Check if we need permission on mount
  useEffect(() => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      setNeedsPermission(true);
    } else {
      setPermissionGranted(true);
    }
  }, []);

  // Request permission handler (called from a button)
  const requestPermission = async () => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result === 'granted') {
          setPermissionGranted(true);
          setNeedsPermission(false);
        }
      } catch { /* ignore */ }
    }
  };

  // Orientation handler - runs while editing
  useEffect(() => {
    if (!editing || !permissionGranted) return;

    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      // On first event, capture baseline
      if (baseline.current.beta === 0 && baseline.current.gamma === 0) {
        baseline.current.beta = beta;
        baseline.current.gamma = gamma;
      }

      const betaDelta = beta - baseline.current.beta;
      const gammaDelta = gamma - baseline.current.gamma;

      // ±20° = full range (0-100 for sat, 5-95 for light)
      const maxTilt = 20;
      const satChange = (gammaDelta / maxTilt) * 50;
      const lightChange = -(betaDelta / maxTilt) * 50;

      const newSat = Math.max(0, Math.min(100, Math.round(baseline.current.sat + satChange)));
      const newLight = Math.max(5, Math.min(95, Math.round(baseline.current.light + lightChange)));

      setColors(prev => {
        if (editingRef.current === 'text') {
          return { ...prev, sat: newSat, light: newLight };
        } else if (editingRef.current === 'bg') {
          return { ...prev, bgSat: newSat, bgLight: newLight };
        }
        return prev;
      });
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [editing, permissionGranted]);

  // Touch move handler - updates hue based on Y position
  useEffect(() => {
    if (!editing) return;

    const handleMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!sliderRef.current || !editingRef.current) return;

      const touch = e.touches[0];
      const rect = sliderRef.current.getBoundingClientRect();
      const relY = (touch.clientY - rect.top) / rect.height;
      const clampedY = Math.max(0, Math.min(1, relY));
      const newHue = Math.round(clampedY * 360);

      setColors(prev => {
        if (editingRef.current === 'text') {
          return { ...prev, hue: newHue };
        } else if (editingRef.current === 'bg') {
          return { ...prev, bgHue: newHue };
        }
        return prev;
      });
    };

    const handleEnd = () => {
      if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
      setEditing(null);
      setShowCopyPaste(true); // Show copy/paste after releasing
      // Reset baseline for next edit
      baseline.current = { beta: 0, gamma: 0, sat: 50, light: 50 };
    };

    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [editing]);

  // Start editing - called on touchstart of text/bg buttons
  const startEditing = (which: 'text' | 'bg') => {
    if (navigator.vibrate) navigator.vibrate(10);
    setShowCopyPaste(false); // Hide copy/paste when starting to edit

    // Capture current sat/light as baseline
    if (which === 'text') {
      baseline.current.sat = colors.sat;
      baseline.current.light = colors.light;
    } else {
      baseline.current.sat = colors.bgSat;
      baseline.current.light = colors.bgLight;
    }
    // Reset orientation baseline (will be set on first orientation event)
    baseline.current.beta = 0;
    baseline.current.gamma = 0;

    setEditing(which);
  };

  // Copy handler
  const handleCopy = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const text = `txt: ${colors.hue}, ${colors.sat}%, ${colors.light}%\nbg: ${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%`;
    navigator.clipboard.writeText(text).catch(() => {});
    setShowCopyPaste(false);
  };

  // Paste handler - instant, no async/await blocking
  const handlePaste = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    navigator.clipboard.readText().then(text => {
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
      setShowCopyPaste(false);
    }).catch(() => { setShowCopyPaste(false); });
  };

  const currentHue = editing === 'text' ? colors.hue : colors.bgHue;
  const currentSat = editing === 'text' ? colors.sat : colors.bgSat;
  const currentLight = editing === 'text' ? colors.light : colors.bgLight;

  // Generate hue gradient with current sat/light values
  const hueGradient = `linear-gradient(to bottom,
    hsl(0, ${currentSat}%, ${currentLight}%),
    hsl(60, ${currentSat}%, ${currentLight}%),
    hsl(120, ${currentSat}%, ${currentLight}%),
    hsl(180, ${currentSat}%, ${currentLight}%),
    hsl(240, ${currentSat}%, ${currentLight}%),
    hsl(300, ${currentSat}%, ${currentLight}%),
    hsl(360, ${currentSat}%, ${currentLight}%)
  )`;

  // If we need permission and haven't granted it yet, show permission button
  if (needsPermission && !permissionGranted) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: bgColor,
        }}
      >
        {/* Top 3/4: big "good days" */}
        <div
          style={{
            flex: '0 0 75%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0px',
          }}
        >
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '64px', lineHeight: 1 }}>
            good
          </span>
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '64px', lineHeight: 1 }}>
            days
          </span>
        </div>
        {/* Bottom 1/4: instruction + button */}
        <div
          style={{
            flex: '0 0 25%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '16px',
          }}
        >
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px' }}>
            hold your phone flat
          </span>
          <button
            onClick={requestPermission}
            style={{
              padding: '16px 32px',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '16px',
              backgroundColor: 'transparent',
              border: `4px solid ${textColor}`,
              borderRadius: '12px',
              color: textColor,
            }}
          >
            enable accelerometer
          </button>
        </div>
      </div>
    );
  }

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
      } as React.CSSProperties}
    >
      {/* Top half: good days */}
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
      </div>

      {/* Bottom: text/bg buttons, copy/paste buttons, or hue slider */}
      {!editing && !showCopyPaste ? (
        <div style={{ padding: '0 40px 60px', display: 'flex' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); startEditing('text'); }}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            text
          </div>
          <div
            onTouchStart={(e) => { e.preventDefault(); startEditing('bg'); }}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            background
          </div>
        </div>
      ) : !editing && showCopyPaste ? (
        <div style={{ padding: '0 40px 60px', display: 'flex' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); handleCopy(); }}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            copy
          </div>
          <div
            onTouchStart={(e) => { e.preventDefault(); handlePaste(); }}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            paste
          </div>
        </div>
      ) : (
        <div
          ref={sliderRef}
          style={{
            flex: '0 0 50%',
            position: 'relative',
            background: hueGradient,
          }}
        >
          {/* Horizontal indicator line - white with black borders, no aliasing */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(currentHue / 360) * 100}%`,
              height: '2px',
              backgroundColor: 'white',
              borderTop: '1px solid black',
              borderBottom: '1px solid black',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              imageRendering: 'pixelated',
            } as React.CSSProperties}
          />
          {/* Current values */}
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
            }}
          >
            drag ↕ hue • tilt for sat/light
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

import { StrictMode, useState, useEffect, useRef, useCallback } from 'react'
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

  // Editing state
  const [editing, setEditing] = useState<'picking' | null>(null);

  // Touch Y positions for hue indicators (0-1)
  const [bgTouchY, setBgTouchY] = useState(0);
  const [textTouchY, setTextTouchY] = useState(0);

  // Tilt values for sat/brightness (-1 to 1)
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  // Button press states
  const [resetPressed, setResetPressed] = useState(false);
  const [copyPressed, setCopyPressed] = useState(false);
  const [pastePressed, setPastePressed] = useState(false);

  // iOS permission state
  const [needsPermission, setNeedsPermission] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Refs
  const baseline = useRef({ beta: 0, gamma: 0, bgSat: 50, bgLight: 50, txtSat: 50, txtLight: 50 });
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);

  // Live touch position - tracked continuously from button press
  const liveTouch = useRef<{ x: number; y: number } | null>(null);
  const barsMounted = useRef(0);
  // Which side started the touch (left = background, right = text)
  const activeSide = useRef<'left' | 'right' | null>(null);

  // Debug state for on-screen display
  const [debugInfo, setDebugInfo] = useState('');

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

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

  // Lock to portrait
  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation?.lock) {
      orientation.lock('portrait').catch(() => {});
    }
  }, []);

  // Check iOS permission
  useEffect(() => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      setNeedsPermission(true);
    } else {
      setPermissionGranted(true);
    }
  }, []);

  // Request permission
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

  // Process touch - uses activeSide to know which bar, only needs Y position
  const processTouchAt = useCallback((y: number, source?: string) => {
    // Use whichever bar exists to get the Y mapping
    const bar = activeSide.current === 'left' ? leftBarRef.current : rightBarRef.current;
    if (!bar) {
      setDebugInfo(`${source}: no bar yet`);
      return false;
    }

    const rect = bar.getBoundingClientRect();
    const relY = (y - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relY));
    const newHue = Math.round(clampedY * 360);

    setDebugInfo(`${source}: y=${y.toFixed(0)} → ${(clampedY * 100).toFixed(0)}%`);

    if (activeSide.current === 'left') {
      setBgTouchY(clampedY);
      setColors(prev => ({ ...prev, bgHue: newHue }));
    } else {
      setTextTouchY(clampedY);
      setColors(prev => ({ ...prev, hue: newHue }));
    }
    return true;
  }, []);

  // When picker appears, snap indicator to current finger position
  useEffect(() => {
    if (editing === 'picking' && liveTouch.current) {
      // Wait for bars to render, then process
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (liveTouch.current) {
            processTouchAt(liveTouch.current.y, 'PICKER_READY');
          }
        });
      });
    }
  }, [editing, processTouchAt]);

  // Orientation handler while picking
  useEffect(() => {
    if (!editing || !permissionGranted) return;

    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      // Capture baseline on first event
      if (baseline.current.beta === 0 && baseline.current.gamma === 0) {
        baseline.current.beta = beta;
        baseline.current.gamma = gamma;
      }

      const betaDelta = beta - baseline.current.beta;
      const gammaDelta = gamma - baseline.current.gamma;

      const maxTilt = 15;

      // Tilt visualization
      setTiltY(Math.max(-1, Math.min(1, betaDelta / maxTilt)));
      setTiltX(Math.max(-1, Math.min(1, gammaDelta / maxTilt)));

      // Absolute mapping for sat/light
      // Center (flat) = 50, full left = 0, full right = 100
      const tiltNormX = Math.max(-1, Math.min(1, gammaDelta / maxTilt));
      const tiltNormY = Math.max(-1, Math.min(1, betaDelta / maxTilt));

      // Saturation: left=0, center=50, right=100
      const newSat = Math.round(50 + tiltNormX * 50);
      // Lightness: forward=5, center=50, back=95
      const newLight = Math.round(50 - tiltNormY * 45);

      const newBgSat = Math.max(0, Math.min(100, newSat));
      const newBgLight = Math.max(5, Math.min(95, newLight));
      const newTxtSat = Math.max(0, Math.min(100, newSat));
      const newTxtLight = Math.max(5, Math.min(95, newLight));

      setColors(prev => ({
        ...prev,
        bgSat: newBgSat,
        bgLight: newBgLight,
        sat: newTxtSat,
        light: newTxtLight,
      }));
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [editing, permissionGranted]);

  // Tracking active - starts on button press, before picker appears
  const isTrackingRef = useRef(false);

  // Global touch handlers - ALWAYS listening, track position continuously
  useEffect(() => {
    const handleMove = (e: TouchEvent) => {
      if (!isTrackingRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        // Always update live position
        liveTouch.current = { x: touch.clientX, y: touch.clientY };
        // If bars exist, process Y position immediately
        if (leftBarRef.current || rightBarRef.current) {
          processTouchAt(touch.clientY, 'MOVE');
        }
      }
    };

    const handleEnd = () => {
      if (!isTrackingRef.current) return;
      isTrackingRef.current = false;
      activeSide.current = null;
      if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
      setEditing(null);
      baseline.current = { beta: 0, gamma: 0, bgSat: 50, bgLight: 50, txtSat: 50, txtLight: 50 };
      setTiltX(0);
      setTiltY(0);
      liveTouch.current = null;
      barsMounted.current = 0;
    };

    // Handlers attached on mount - always listening
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [processTouchAt]);

  // Start picking - begin tracking IMMEDIATELY
  const startPicking = (side: 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(10);

    // Set which side we're controlling
    activeSide.current = side;

    // Start tracking IMMEDIATELY - before any state changes
    isTrackingRef.current = true;

    // Store current touch position
    const touch = e.touches[0];
    liveTouch.current = { x: touch.clientX, y: touch.clientY };
    setDebugInfo(`START ${side}: y=${touch.clientY.toFixed(0)}`);
    barsMounted.current = 0;

    // Capture current values as baseline
    baseline.current.bgSat = colors.bgSat;
    baseline.current.bgLight = colors.bgLight;
    baseline.current.txtSat = colors.sat;
    baseline.current.txtLight = colors.light;
    baseline.current.beta = 0;
    baseline.current.gamma = 0;

    // Initialize touch positions from current hues
    setBgTouchY(colors.bgHue / 360);
    setTextTouchY(colors.hue / 360);

    setTiltX(0);
    setTiltY(0);
    setEditing('picking');
  };

  // Reset tilt baseline
  const handleResetTilt = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    baseline.current.beta = 0;
    baseline.current.gamma = 0;
  };

  // Copy
  const handleCopy = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const text = `txt: ${colors.hue}, ${colors.sat}%, ${colors.light}%\nbg: ${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  // Paste
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
    }).catch(() => {});
  };

  // Button style helper - follows style guide with fill on press
  const getButtonStyle = (pressed: boolean, position: 'left' | 'right' | 'full') => {
    const borderColor = `hsla(${colors.hue}, ${colors.sat}%, ${pressed ? 65 : colors.light}%, ${pressed ? 1 : 0.6})`;
    const fillColor = pressed ? `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.2)` : 'transparent';
    const base: React.CSSProperties = {
      flex: position === 'full' ? undefined : 1,
      width: position === 'full' ? '100%' : undefined,
      padding: '14px 0',
      fontFamily: 'monospace',
      fontWeight: 800,
      fontSize: '16px',
      backgroundColor: fillColor,
      color: textColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };
    if (position === 'left') {
      return { ...base, border: `4px solid ${borderColor}`, borderRightWidth: '2px', borderRadius: '12px 0 0 12px' };
    } else if (position === 'right') {
      return { ...base, border: `4px solid ${borderColor}`, borderLeftWidth: '2px', borderRadius: '0 12px 12px 0' };
    }
    return { ...base, border: `4px solid ${borderColor}`, borderRadius: '12px' };
  };

  // Pure hue gradient - always 100% sat, 50% light (unaffected by tilt)
  const pureHueGradient = `linear-gradient(to bottom,
    hsl(0, 100%, 50%),
    hsl(60, 100%, 50%),
    hsl(120, 100%, 50%),
    hsl(180, 100%, 50%),
    hsl(240, 100%, 50%),
    hsl(300, 100%, 50%),
    hsl(360, 100%, 50%)
  )`;

  // Permission screen
  if (needsPermission && !permissionGranted) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        <div style={{ flex: '0 0 70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '80px', lineHeight: 1 }}>good</span>
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '80px', lineHeight: 1 }}>days</span>
        </div>
        <div style={{ flex: '0 0 30%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 40px', gap: '16px' }}>
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '24px' }}>hold flat</span>
          <button
            onClick={requestPermission}
            style={{ width: '100%', padding: '16px 0', fontFamily: 'monospace', fontWeight: 800, fontSize: '24px', backgroundColor: 'transparent', border: `4px solid ${textColor}`, borderRadius: '12px', color: textColor }}
          >
            set tilt
          </button>
        </div>
      </div>
    );
  }

  // Picker screen
  if (editing === 'picking') {
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
        {/* Top: good days + sat/brightness square with labels */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 20px' }}>
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '48px', lineHeight: 1 }}>good</span>
          <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '48px', lineHeight: 1 }}>days</span>

          {/* Sat/Brightness square with side labels */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
            {/* Left: Saturation label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', opacity: 0.6 }}>sat</span>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '36px' }}>{colors.sat}</span>
            </div>

            {/* Square */}
            <div
              style={{
                width: '100px',
                height: '100px',
                position: 'relative',
                border: `2px solid ${textColor}`,
              }}
            >
              {/* Dot - white fill, black border */}
              <div
                style={{
                  position: 'absolute',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  border: '2px solid black',
                  left: `calc(50% + ${tiltX * 40}px)`,
                  top: `calc(50% + ${tiltY * 40}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>

            {/* Right: Lightness label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', opacity: 0.6 }}>light</span>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '36px' }}>{colors.light}</span>
            </div>
          </div>

          {/* Debug info */}
          {debugInfo && (
            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '8px' }}>
              <pre style={{ color: 'white', fontFamily: 'monospace', fontSize: '10px', margin: 0, whiteSpace: 'pre-wrap' }}>{debugInfo}</pre>
            </div>
          )}
        </div>

        {/* Bottom: two hue bars side by side */}
        <div style={{ flex: 1, display: 'flex', gap: '0' }}>
          {/* Left: background hue bar */}
          <div
            ref={leftBarRef}
            style={{
              flex: 1,
              position: 'relative',
              background: pureHueGradient,
            }}
          >
            <span style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 800,
              WebkitTextStroke: '1px black',
              paintOrder: 'stroke fill',
            } as React.CSSProperties}>
              background
            </span>
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${bgTouchY * 100}%`,
              height: '2px',
              backgroundColor: 'white',
              boxShadow: '0 -1px 0 black, 0 1px 0 black',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Right: text hue bar */}
          <div
            ref={rightBarRef}
            style={{
              flex: 1,
              position: 'relative',
              background: pureHueGradient,
            }}
          >
            <span style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 800,
              WebkitTextStroke: '1px black',
              paintOrder: 'stroke fill',
            } as React.CSSProperties}>
              text
            </span>
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${textTouchY * 100}%`,
              height: '2px',
              backgroundColor: 'white',
              boxShadow: '0 -1px 0 black, 0 1px 0 black',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      </div>
    );
  }

  // Home screen
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '80px', lineHeight: 1 }}>good</span>
        <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '80px', lineHeight: 1 }}>days</span>
      </div>

      <div style={{ padding: '0 40px 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          onTouchStart={(e) => { e.preventDefault(); setResetPressed(true); }}
          onTouchEnd={(e) => { e.preventDefault(); setResetPressed(false); handleResetTilt(); }}
          onTouchCancel={() => setResetPressed(false)}
          style={getButtonStyle(resetPressed, 'full')}
        >
          reset tilt
        </div>

        <div style={{ display: 'flex' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); setCopyPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setCopyPressed(false); handleCopy(); }}
            onTouchCancel={() => setCopyPressed(false)}
            style={getButtonStyle(copyPressed, 'left')}
          >
            copy
          </div>
          <div
            onTouchStart={(e) => { e.preventDefault(); setPastePressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setPastePressed(false); handlePaste(); }}
            onTouchCancel={() => setPastePressed(false)}
            style={getButtonStyle(pastePressed, 'right')}
          >
            paste
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          <div
            onTouchStart={startPicking('left')}
            style={{
              flex: 1,
              padding: '14px 0',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '16px',
              backgroundColor: 'transparent',
              border: `4px solid ${textColor}`,
              borderRightWidth: '2px',
              borderRadius: '12px 0 0 12px',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            background
          </div>
          <div
            onTouchStart={startPicking('right')}
            style={{
              flex: 1,
              padding: '14px 0',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '16px',
              backgroundColor: 'transparent',
              border: `4px solid ${textColor}`,
              borderLeftWidth: '2px',
              borderRadius: '0 12px 12px 0',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            text
          </div>
        </div>
      </div>
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

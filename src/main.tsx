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
  const [colors, setColors] = useState<ColorState>({
    hue: 116, sat: 100, light: 53, bgHue: 96, bgSat: 100, bgLight: 0,
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
  const baseline = useRef({ beta: 0, gamma: 0 });
  const rawOrientation = useRef({ beta: 0, gamma: 0 });
  const baselineCaptured = useRef(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);

  // Live touch position - tracked continuously from button press
  const liveTouch = useRef<{ x: number; y: number } | null>(null);
  const barsMounted = useRef(0);
  // Which side started the touch (left = background, right = text)
  const activeSide = useRef<'left' | 'right' | null>(null);


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

  // Prevent iOS context menu / Writing Tools on long press
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    return () => document.removeEventListener('contextmenu', prevent);
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
      return false;
    }

    const rect = bar.getBoundingClientRect();
    const relY = (y - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relY));
    const newHue = Math.round(clampedY * 360);

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
  // Poll until ref is actually set - don't rely on arbitrary RAF count
  useEffect(() => {
    if (editing !== 'picking' || !liveTouch.current) return;

    let cancelled = false;
    const tryProcess = () => {
      if (cancelled) return;
      const bar = activeSide.current === 'left' ? leftBarRef.current : rightBarRef.current;
      if (bar && liveTouch.current) {
        processTouchAt(liveTouch.current.y, 'PICKER_READY');
      } else {
        // Ref not set yet, try again next frame
        requestAnimationFrame(tryProcess);
      }
    };
    requestAnimationFrame(tryProcess);

    return () => { cancelled = true; };
  }, [editing, processTouchAt]);

  // Orientation handler - ALWAYS runs (tracks tilt for home screen dot too)
  useEffect(() => {
    if (!permissionGranted) return;

    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      // Store raw values for reset
      rawOrientation.current = { beta, gamma };

      // Capture baseline on first event
      if (!baselineCaptured.current) {
        baseline.current.beta = beta;
        baseline.current.gamma = gamma;
        baselineCaptured.current = true;
      }

      const betaDelta = beta - baseline.current.beta;
      const gammaDelta = gamma - baseline.current.gamma;

      const maxTilt = 9;

      // Always update tilt visualization (home + picker)
      setTiltY(Math.max(-1, Math.min(1, betaDelta / maxTilt)));
      setTiltX(Math.max(-1, Math.min(1, gammaDelta / maxTilt)));

      // Only update colors when picking
      if (editingRef.current === 'picking') {
        const tiltNormX = Math.max(-1, Math.min(1, gammaDelta / maxTilt));
        const tiltNormY = Math.max(-1, Math.min(1, betaDelta / maxTilt));

        const newSat = Math.round(50 + tiltNormX * 50);
        const newLight = Math.round(50 - tiltNormY * 50);

        if (activeSide.current === 'left') {
          setColors(prev => ({
            ...prev,
            bgSat: Math.max(0, Math.min(100, newSat)),
            bgLight: Math.max(0, Math.min(100, newLight)),
          }));
        } else {
          setColors(prev => ({
            ...prev,
            sat: Math.max(0, Math.min(100, newSat)),
            light: Math.max(0, Math.min(100, newLight)),
          }));
        }
      }
    };

    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [permissionGranted]);

  // Tracking active - starts on button press, before picker appears
  const isTrackingRef = useRef(false);

  // Global touch handlers - ALWAYS listening, track position continuously
  useEffect(() => {
    const handleMove = (e: TouchEvent) => {
      if (!isTrackingRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        liveTouch.current = { x: touch.clientX, y: touch.clientY };

        // Determine which side based on finger X position
        const leftBar = leftBarRef.current;
        const rightBar = rightBarRef.current;
        if (leftBar && rightBar) {
          const leftRect = leftBar.getBoundingClientRect();
          const rightRect = rightBar.getBoundingClientRect();
          const midX = (leftRect.right + rightRect.left) / 2;
          const newSide = touch.clientX < midX ? 'left' : 'right';
          if (newSide !== activeSide.current) {
            // Switching sides - haptic tick
            if (navigator.vibrate) navigator.vibrate(5);
            activeSide.current = newSide;
          }
        }

        const bar = activeSide.current === 'left' ? leftBar : rightBar;
        if (bar) {
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
    barsMounted.current = 0;

    // Compute indicator position from finger Y using the bar ref
    // (bars are always in DOM due to visibility toggle, so ref exists)
    const bar = side === 'left' ? leftBarRef.current : rightBarRef.current;
    if (bar) {
      const rect = bar.getBoundingClientRect();
      const relY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
      if (side === 'left') setBgTouchY(relY);
      else setTextTouchY(relY);
    }

    setEditing('picking');
  };

  // Reset tilt baseline - captures current orientation as new zero point
  const handleResetTilt = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    baseline.current.beta = rawOrientation.current.beta;
    baseline.current.gamma = rawOrientation.current.gamma;
  };

  // Copy
  const handleCopy = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const text = `txt: ${colors.hue}, ${colors.sat}%, ${colors.light}%\nbg: ${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%`;
    // Textarea + execCommand for plain text copy on iOS (clipboard API URL-encodes in iMessage)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;background:transparent;opacity:0.01;font-size:16px;-webkit-user-select:text;user-select:text;';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    // Fall back to clipboard API if execCommand failed
    if (!ok) navigator.clipboard.writeText(text).catch(() => {});
  };

  // Paste
  const handlePaste = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    navigator.clipboard.readText().then(raw => {
      let text = raw;
      try { text = decodeURIComponent(raw); } catch { /* not encoded, use as-is */ }
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
      fontSize: '20px',
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

  // Set tilt button press state
  const [setTiltPressed, setSetTiltPressed] = useState(false);

  // Shared title style - one line, as big as possible
  const titleStyle: React.CSSProperties = {
    color: textColor, fontFamily: 'monospace', fontWeight: 800,
    fontSize: 'min(17vw, 70px)', lineHeight: 1, padding: '16px 0 0', textAlign: 'center', whiteSpace: 'nowrap',
  };

  // Corner bracket length
  const cornerLen = 24;
  const cornerW = 4;

  // Corner brackets - 4 L-shaped pieces at corners
  const cornerBrackets = (size: number, color: string) => (
    <>
      {/* Top-left */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Top-right */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Bottom-left */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
      {/* Bottom-right */}
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
    </>
  );

  // Tilt square - corner brackets, +, dot, all in text color
  const tiltSquare = (size: number) => {
    const dotTravel = (size / 2) - 10;
    const plusArm = cornerLen / 2;
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {cornerBrackets(size, textColor)}
        {/* + at center - same thickness as corners */}
        <div style={{ position: 'absolute', left: '50%', top: `calc(50% - ${plusArm}px)`, width: `${cornerW}px`, height: `${plusArm * 2}px`, backgroundColor: textColor, transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: `calc(50% - ${plusArm}px)`, height: `${cornerW}px`, width: `${plusArm * 2}px`, backgroundColor: textColor, transform: 'translateY(-50%)' }} />
        {/* Dot - text color, no border */}
        <div
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: textColor,
            left: `calc(50% + ${tiltX * dotTravel}px)`,
            top: `calc(50% + ${tiltY * dotTravel}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    );
  };

  // Permission screen (iOS only)
  if (needsPermission && !permissionGranted) {
    const tiltBorderColor = `hsla(${colors.hue}, ${colors.sat}%, ${setTiltPressed ? 65 : colors.light}%, ${setTiltPressed ? 1 : 0.6})`;
    const tiltFillColor = setTiltPressed ? `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.2)` : 'transparent';
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        <span style={titleStyle}>good days</span>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '0 40px 60px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); setSetTiltPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setSetTiltPressed(false); requestPermission(); }}
            onTouchCancel={() => setSetTiltPressed(false)}
            style={{ width: '100%', padding: '16px 0', fontFamily: 'monospace', fontWeight: 800, fontSize: '20px', backgroundColor: tiltFillColor, border: `4px solid ${tiltBorderColor}`, borderRadius: '12px', color: textColor, textAlign: 'center' }}
          >
            calibrate tilt
          </div>
        </div>
      </div>
    );
  }

  const isPicking = editing === 'picking';

  // BOTH screens always rendered (never removed from DOM).
  // iOS stops delivering touchmove events when the touchstart target element
  // is removed from the DOM. By keeping both screens alive and toggling
  // visibility, the button that started the touch persists, and iOS
  // continues delivering touchmove events to window listeners.
  return (
    <>
      {/* ===== PICKER SCREEN (visible when picking) ===== */}
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
          visibility: isPicking ? 'visible' : 'hidden',
          zIndex: isPicking ? 10 : -1,
        } as React.CSSProperties}
      >
        <span style={titleStyle}>good days</span>

        {/* Square complex - centered between title and spectrum */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>
            {tiltSquare(252)}
            {/* Left: Saturation label - positioned outside square */}
            <div style={{ position: 'absolute', right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px' }}>sat</span>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px' }}>{activeSide.current === 'left' ? colors.bgSat : colors.sat}</span>
            </div>
            {/* Right: Lightness label - positioned outside square */}
            <div style={{ position: 'absolute', left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px' }}>light</span>
              <span style={{ color: textColor, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px' }}>{activeSide.current === 'left' ? colors.bgLight : colors.light}</span>
            </div>
          </div>
        </div>

        {/* Hue bars - sized to match home screen button area */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          {/* Invisible buttons set the correct height */}
          <div style={{ visibility: 'hidden', padding: '0 40px 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={getButtonStyle(false, 'full')}>&nbsp;</div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left')}>&nbsp;</div><div style={getButtonStyle(false, 'right')}>&nbsp;</div></div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left')}>&nbsp;</div><div style={getButtonStyle(false, 'right')}>&nbsp;</div></div>
          </div>
          {/* Bars overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {/* Left: background hue bar */}
            <div
              ref={leftBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient }}
            >
              <span style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', color: 'black', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', pointerEvents: 'none', zIndex: 1 }}>background</span>
              <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${(colors.bgHue / 360) * 100}% - 2px)`, height: '4px', backgroundColor: 'black', opacity: 1, pointerEvents: 'none', zIndex: 1 }} />
              {activeSide.current === 'left' && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: 'black', pointerEvents: 'none', zIndex: 1 }} />
              )}
            </div>

            {/* Black vertical divider */}
            <div style={{ width: '4px', backgroundColor: 'black', flexShrink: 0 }} />

            {/* Right: text hue bar */}
            <div
              ref={rightBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient }}
            >
              <span style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', color: 'black', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', pointerEvents: 'none', zIndex: 1 }}>text</span>
              <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${(colors.hue / 360) * 100}% - 2px)`, height: '4px', backgroundColor: 'black', opacity: 1, pointerEvents: 'none', zIndex: 1 }} />
              {activeSide.current === 'right' && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: 'black', pointerEvents: 'none', zIndex: 1 }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== HOME SCREEN (visible when not picking) ===== */}
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
          visibility: isPicking ? 'hidden' : 'visible',
          zIndex: isPicking ? -1 : 1,
        } as React.CSSProperties}
      >
        <span style={titleStyle}>good days</span>

        {/* Square complex - centered between title and buttons */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiltSquare(252)}
        </div>

        <div style={{ padding: '0 40px 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); setResetPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setResetPressed(false); handleResetTilt(); }}
            onTouchCancel={() => setResetPressed(false)}
            style={getButtonStyle(resetPressed, 'full')}
          >
            recalibrate tilt
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
              style={getButtonStyle(false, 'left')}
            >
              background
            </div>
            <div
              onTouchStart={startPicking('right')}
              style={getButtonStyle(false, 'right')}
            >
              text
            </div>
          </div>
        </div>
      </div>
    </>
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

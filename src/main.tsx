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
  // Try labeled HEX format: "txt: #rrggbb" or "bg: #rrggbb"
  const labeledHexMatch = trimmed.match(/^(txt|bg):\s*#([0-9a-f]{6})/i);
  if (labeledHexMatch) {
    const type = labeledHexMatch[1] as 'txt' | 'bg';
    const hex = labeledHexMatch[2];
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
    return { type, h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  // Try bare HEX format: #rrggbb
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

function MobileScreen() {
  // Color state
  const [colors, setColors] = useState<ColorState>({
    hue: 116, sat: 100, light: 53, bgHue: 96, bgSat: 100, bgLight: 0,
  });

  // Editing state
  const [editing, setEditing] = useState<'picking' | null>(null);

  // Touch Y positions for hue indicators (0-1)
  const [, setBgTouchY] = useState(0);
  const [, setTextTouchY] = useState(0);

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

  // Debug refs & state
  const recalBtnRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const colorTextLabelRef = useRef<HTMLSpanElement>(null);
  const copyPasteRowRef = useRef<HTMLDivElement>(null);
  const textBgRowRef = useRef<HTMLDivElement>(null);
  const [interactionSegmentY, setInteractionSegmentY] = useState(0);
  const [feedbackSegmentY, setFeedbackSegmentY] = useState(0);
  const [squarePerimeter, setSquarePerimeter] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [colorTextLabelY, setColorTextLabelY] = useState(0);
  const [btnRects, setBtnRects] = useState({ recalBottom: 0, copyTop: 0, copyBottom: 0, textBgTop: 0, textBgBottom: 0, screenBottom: 0 });

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

  // Measure debug segment positions
  useEffect(() => {
    const measure = () => {
      if (recalBtnRef.current) setInteractionSegmentY(recalBtnRef.current.getBoundingClientRect().top);
      if (titleRef.current) setFeedbackSegmentY(titleRef.current.getBoundingClientRect().bottom);
      if (colorTextLabelRef.current) setColorTextLabelY(colorTextLabelRef.current.getBoundingClientRect().top);
      if (recalBtnRef.current && copyPasteRowRef.current && textBgRowRef.current) {
        const recal = recalBtnRef.current.getBoundingClientRect();
        const cp = copyPasteRowRef.current.getBoundingClientRect();
        const tb = textBgRowRef.current.getBoundingClientRect();
        setBtnRects({ recalBottom: recal.bottom, copyTop: cp.top, copyBottom: cp.bottom, textBgTop: tb.top, textBgBottom: tb.bottom, screenBottom: window.innerHeight });
      }
      if (squareRef.current) {
        const r = squareRef.current.getBoundingClientRect();
        const vPad = 12, hPad = 26; // label overhang + 2px gap
        setSquarePerimeter({ top: r.top - vPad, left: r.left - hPad, width: r.width + hPad * 2, height: r.height + vPad * 2 });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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
  const processTouchAt = useCallback((y: number, _source?: string) => {
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
      setTextTouchY(clampedY);
      setColors(prev => ({ ...prev, hue: newHue }));
    } else {
      setBgTouchY(clampedY);
      setColors(prev => ({ ...prev, bgHue: newHue }));
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

      const maxTilt = 10;

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
            sat: Math.max(0, Math.min(100, newSat)),
            light: Math.max(0, Math.min(100, newLight)),
          }));
        } else {
          setColors(prev => ({
            ...prev,
            bgSat: Math.max(0, Math.min(100, newSat)),
            bgLight: Math.max(0, Math.min(100, newLight)),
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

        // Update hue: within bar = track, above = snap to top, below = snap to bottom
        const bar = activeSide.current === 'left' ? leftBarRef.current : rightBarRef.current;
        if (bar) {
          const barRect = bar.getBoundingClientRect();
          if (touch.clientY < barRect.top) {
            // Above bar — snap hue to top (0)
            processTouchAt(barRect.top, 'MOVE');
          } else {
            // Within or below bar — processTouchAt clamps to [0,1] internally
            processTouchAt(touch.clientY, 'MOVE');
          }
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
      if (side === 'left') setTextTouchY(relY);
      else setBgTouchY(relY);
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
    const text = `txt: ${hslToHex(colors.hue, colors.sat, colors.light)}\nbg: ${hslToHex(colors.bgHue, colors.bgSat, colors.bgLight)}`;
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

  // Title hold to show version
  const [titlePressed, setTitlePressed] = useState(false);
  const mobileVersion = '1.10.20';

  // Shared title style - one line, as big as possible
  const titleStyle: React.CSSProperties = {
    color: textColor, fontFamily: 'monospace', fontWeight: 800,
    fontSize: 'min(17vw, 70px)', lineHeight: 1, padding: '16px 0 0', textAlign: 'center', whiteSpace: 'nowrap',
  };

  // Debug annotation tag
  const dbg = (text: string, pos: React.CSSProperties = {}): React.ReactElement => (
    <span style={{ position: 'absolute', backgroundColor: 'rgba(255,80,0,0.85)', color: 'white', padding: '0px 3px', fontSize: '7px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: '12px', ...pos }}>{text}</span>
  );

  // Corner bracket length
  const cornerLen = 32;
  const cornerW = 4;

  // Corner brackets - 4 L-shaped pieces at corners
  const cornerBrackets = (_size: number, color: string, showLabels?: boolean) => {
    const labelStyle: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', pointerEvents: 'none', position: 'absolute', color, transform: 'translate(-50%, -50%)' };
    return (
      <>
        {/* Top-left */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
        {dbg(`L: ${cornerLen}\u00D7${cornerW}px`, { top: -14, left: 0 })}
        {/* Top-right */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
        {/* Bottom-left */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
        {/* Bottom-right */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: `${cornerLen}px`, height: `${cornerW}px`, backgroundColor: color }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: `${cornerW}px`, height: `${cornerLen}px`, backgroundColor: color }} />
        {/* Edge midpoint labels - only in picker, centered ON the edge lines */}
        {showLabels && (
          <>
            <span style={{ ...labelStyle, top: 0, left: '50%' }}>white</span>
            {dbg('16px', { top: -14, left: '50%', transform: 'translateX(-50%)' })}
            <span style={{ ...labelStyle, top: 'auto', bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' }}>black</span>
            {dbg('16px', { bottom: -14, left: '50%', transform: 'translateX(-50%)' })}
            <span style={{ ...labelStyle, left: 0, top: '50%', transform: 'translate(-50%, -50%)' }}>gray</span>
            <span style={{ ...labelStyle, right: 0, left: 'auto', top: '50%', transform: 'translate(50%, -50%)' }}>vivid</span>
          </>
        )}
      </>
    );
  };

  // Tilt square - corner brackets, +, dot, all in text color
  const tiltSquare = (size: number, showLabels?: boolean, ref?: React.RefObject<HTMLDivElement | null>) => {
    const dotTravel = (size / 2) - 10;
    const plusArm = cornerLen / 2;
    return (
      <div
        ref={ref}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {cornerBrackets(size, textColor, showLabels)}
        {/* + at center - only on home screen */}
        {!showLabels && (
          <>
            <div style={{ position: 'absolute', left: '50%', top: `calc(50% - ${plusArm}px)`, width: `${cornerW}px`, height: `${plusArm * 2}px`, backgroundColor: textColor, transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: `calc(50% - ${plusArm}px)`, height: `${cornerW}px`, width: `${plusArm * 2}px`, backgroundColor: textColor, transform: 'translateY(-50%)' }} />
            {dbg(`+: ${cornerW}×${plusArm * 2}px`, { top: 'calc(50% + 16px)', left: '50%', transform: 'translateX(-50%)' })}
          </>
        )}
        {/* Dot - text color, no border */}
        {dbg('dot: 16px', { bottom: -14, right: 0 })}
        <div
          style={{
            position: 'absolute',
            width: '16px',
            height: '16px',
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

  const isPicking = editing === 'picking';
  const showCalibrate = needsPermission && !permissionGranted;

  // ALL THREE screens always rendered (visibility-toggled) so debug refs are always measurable.
  return (
    <>
      {/* ===== CALIBRATE SCREEN (visible when needs permission) ===== */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: bgColor, visibility: showCalibrate ? 'visible' : 'hidden', zIndex: showCalibrate ? 20 : -2 }}>
        <div style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,0,0,0.7)', color: 'white', padding: '2px 6px', fontSize: '10px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '4px', zIndex: 999 }}>CALIBRATE SCREEN</div>
        <span
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>
        <div style={{ flex: 1 }} />
        <div style={{ padding: '0 0 60px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); setSetTiltPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setSetTiltPressed(false); requestPermission(); }}
            onTouchCancel={() => setSetTiltPressed(false)}
            style={getButtonStyle(setTiltPressed, 'full')}
          >
            calibrate tilt
          </div>
        </div>
      </div>

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
        <div style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,0,0,0.7)', color: 'white', padding: '2px 6px', fontSize: '10px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '4px', zIndex: 999 }}>COLOR SCREEN</div>
        <span
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>

        {/* Square complex - centered between title and spectrum */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiltSquare(252, true)}
        </div>

        {/* Hue bars - sized to match home screen button area */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          {/* Live hex codes - at top of interaction segment */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', pointerEvents: 'none', zIndex: 3 }}>
            <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>txt: {hslToHex(colors.hue, colors.sat, colors.light)}</span>
            <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>bg: {hslToHex(colors.bgHue, colors.bgSat, colors.bgLight)}</span>
          </div>
          {/* Invisible buttons set the correct height */}
          <div style={{ visibility: 'hidden', padding: '0 0 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={getButtonStyle(false, 'full')}>&nbsp;</div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left')}>&nbsp;</div><div style={getButtonStyle(false, 'right')}>&nbsp;</div></div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left')}>&nbsp;</div><div style={getButtonStyle(false, 'right')}>&nbsp;</div></div>
          </div>
          {/* text|background labels — measured from home screen ref for pixel-perfect match */}
          {btnRects.textBgTop > 0 && (
            <div style={{ position: 'fixed', top: btnRects.textBgTop, left: 0, right: 0, height: btnRects.textBgBottom - btnRects.textBgTop, display: 'flex', zIndex: 5, pointerEvents: 'none' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '20px', color: 'black' }}>text</div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '20px', color: 'black' }}>background</div>
            </div>
          )}
          {/* Bars overlay - top offset makes room for hex codes, gradient squishes to fit */}
          <div style={{ position: 'absolute', top: 24, left: 0, right: 0, bottom: 0, display: 'flex' }}>
            {/* Left: text hue bar */}
            <div
              ref={leftBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {(() => { const active = isPicking && activeSide.current === 'left'; const h = active ? 8 : 4; return <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${(colors.hue / 360) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'black', opacity: 1, pointerEvents: 'none', zIndex: 1 }} />; })()}
              {dbg('indicator: 4/8px', { bottom: 4, left: 4 })}
            </div>

            {/* Right: background hue bar */}
            <div
              ref={rightBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {(() => { const active = isPicking && activeSide.current === 'right'; const h = active ? 8 : 4; return <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${(colors.bgHue / 360) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'black', opacity: 1, pointerEvents: 'none', zIndex: 1 }} />; })()}
            </div>

            {/* Black vertical divider - absolutely positioned to guarantee flush with spectra */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '8px', transform: 'translateX(-50%)', backgroundColor: 'black', zIndex: 2 }}>
              {dbg('8px', { top: '50%', left: 10, transform: 'translateY(-50%)' })}
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
        <div style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,0,0,0.7)', color: 'white', padding: '2px 6px', fontSize: '10px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '4px', zIndex: 999 }}>HOME SCREEN</div>
        <span
          ref={titleRef}
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>
        <span style={{ position: 'absolute', left: 4, top: 20, backgroundColor: 'rgba(255,80,0,0.85)', color: 'white', padding: '0px 3px', fontSize: '7px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', zIndex: 9999, pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: '12px' }}>title: min(17vw,70px)</span>

        {/* Square complex - centered between title and buttons */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiltSquare(252, false, squareRef)}
        </div>

        <div style={{ padding: '0 0 60px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
          <div
            ref={recalBtnRef}
            onTouchStart={(e) => { e.preventDefault(); setResetPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setResetPressed(false); handleResetTilt(); }}
            onTouchCancel={() => setResetPressed(false)}
            style={{ ...getButtonStyle(resetPressed, 'full'), position: 'relative' }}
          >
            recalibrate tilt
            {dbg('20px / 4px bdr / 12px rad', { top: -14, right: 0 })}
          </div>

          <div ref={textBgRowRef} style={{ display: 'flex', position: 'relative' }}>
            <div
              onTouchStart={startPicking('left')}
              style={getButtonStyle(false, 'left')}
            >
              text
            </div>
            <div
              onTouchStart={startPicking('right')}
              style={getButtonStyle(false, 'right')}
            >
              background
            </div>
            {dbg('20px / 4px bdr / 2px inner', { top: -14, right: 0 })}
          </div>

          <div ref={copyPasteRowRef} style={{ display: 'flex', position: 'relative' }}>
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
              style={{ ...getButtonStyle(pastePressed, 'right'), WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
              role="button"
              tabIndex={-1}
              // @ts-expect-error -- writingSuggestions is a valid HTML attribute (iOS 18+) not yet in React types
              writingSuggestions="false"
              contentEditable={false}
              spellCheck={false}
            >
              <span style={{ pointerEvents: 'none' }}>{'p'}{'a'}{'s'}{'t'}{'e'}</span>
            </div>
            {dbg('20px / 4px bdr / 2px inner', { top: -14, right: 0 })}
          </div>
        </div>
      </div>

      {/* ===== DEBUG OVERLAYS ===== */}
      <div style={{ position: 'fixed', top: 4, left: 4, backgroundColor: 'rgba(0,180,0,0.7)', color: 'white', padding: '1px 4px', fontSize: '8px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', zIndex: 9999, pointerEvents: 'none' }}>GOOD DAYS SEGMENT</div>
      {feedbackSegmentY > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, top: feedbackSegmentY, zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{ height: '1px', backgroundColor: 'cyan', opacity: 0.8 }} />
          <span style={{ position: 'absolute', top: 2, left: 4, backgroundColor: 'rgba(0,200,200,0.7)', color: 'white', padding: '1px 4px', fontSize: '8px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px' }}>FEEDBACK SEGMENT TOP</span>
        </div>
      )}
      {interactionSegmentY > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, top: interactionSegmentY, zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{ height: '1px', backgroundColor: 'red', opacity: 0.8 }} />
          <span style={{ position: 'absolute', top: 2, left: 4, backgroundColor: 'rgba(255,0,0,0.7)', color: 'white', padding: '1px 4px', fontSize: '8px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px' }}>INTERACTION SEGMENT TOP</span>
        </div>
      )}
      {/* Square complex perimeter */}
      {squarePerimeter.width > 0 && (
        <div style={{ position: 'fixed', top: squarePerimeter.top, left: squarePerimeter.left, width: squarePerimeter.width, height: squarePerimeter.height, border: '1px dashed yellow', zIndex: 9999, pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', top: -14, left: 0, backgroundColor: 'rgba(200,200,0,0.7)', color: 'white', padding: '1px 4px', fontSize: '8px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px' }}>SQUARE COMPLEX PERIMETER</span>
          <span style={{ position: 'absolute', top: -14, right: 0, backgroundColor: 'rgba(200,200,0,0.7)', color: 'white', padding: '1px 4px', fontSize: '8px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px' }}>{Math.round(squarePerimeter.width)}px</span>
          <span style={{ position: 'absolute', right: -4, top: '50%', transform: 'translate(100%, -50%)', backgroundColor: 'rgba(200,200,0,0.7)', color: 'white', padding: '1px 4px', fontSize: '8px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px' }}>{Math.round(squarePerimeter.height)}px</span>
        </div>
      )}
      {/* Vertical gap measurements (right side, staggered) - 3px thick lines */}
      {/* 1: "background" text top → interaction segment top */}
      {colorTextLabelY > 0 && interactionSegmentY > 0 && (
        <div style={{ position: 'fixed', top: interactionSegmentY, right: 6, height: colorTextLabelY - interactionSegmentY, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '3px', flex: 1, backgroundColor: 'magenta' }} />
          <span style={{ backgroundColor: 'rgba(200,0,200,0.85)', color: 'white', padding: '1px 4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', whiteSpace: 'nowrap' }}>{Math.round(colorTextLabelY - interactionSegmentY)}px</span>
          <div style={{ width: '3px', height: '4px', backgroundColor: 'magenta' }} />
        </div>
      )}
      {/* 2: interaction segment top → square complex perimeter bottom */}
      {interactionSegmentY > 0 && squarePerimeter.height > 0 && (() => {
        const sqBottom = squarePerimeter.top + squarePerimeter.height;
        const gap = interactionSegmentY - sqBottom;
        return gap > 0 ? (
          <div style={{ position: 'fixed', top: sqBottom, right: 36, height: gap, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '3px', height: '4px', backgroundColor: 'orange' }} />
            <div style={{ width: '3px', flex: 1, backgroundColor: 'orange' }} />
            <span style={{ backgroundColor: 'rgba(255,140,0,0.85)', color: 'white', padding: '1px 4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', whiteSpace: 'nowrap' }}>{Math.round(gap)}px</span>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'orange' }} />
            <div style={{ width: '3px', height: '4px', backgroundColor: 'orange' }} />
          </div>
        ) : null;
      })()}
      {/* 3: square complex perimeter top → good days segment bottom (feedback segment top) */}
      {feedbackSegmentY > 0 && squarePerimeter.top > 0 && (() => {
        const gap = squarePerimeter.top - feedbackSegmentY;
        return gap > 0 ? (
          <div style={{ position: 'fixed', top: feedbackSegmentY, right: 66, height: gap, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '3px', height: '4px', backgroundColor: 'lime' }} />
            <div style={{ width: '3px', flex: 1, backgroundColor: 'lime' }} />
            <span style={{ backgroundColor: 'rgba(0,200,0,0.85)', color: 'white', padding: '1px 4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', whiteSpace: 'nowrap' }}>{Math.round(gap)}px</span>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'lime' }} />
            <div style={{ width: '3px', height: '4px', backgroundColor: 'lime' }} />
          </div>
        ) : null;
      })()}
      {/* Button gap measurements (left side) */}
      {/* recalibrate → copy|paste gap */}
      {btnRects.recalBottom > 0 && btnRects.copyTop > 0 && (() => {
        const gap = btnRects.copyTop - btnRects.recalBottom;
        return gap > 0 ? (
          <div style={{ position: 'fixed', top: btnRects.recalBottom, left: 8, height: gap, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'white' }} />
            <span style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: 'black', padding: '1px 4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', whiteSpace: 'nowrap' }}>{Math.round(gap)}px</span>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'white' }} />
          </div>
        ) : null;
      })()}
      {/* copy|paste → text|bg gap */}
      {btnRects.copyBottom > 0 && btnRects.textBgTop > 0 && (() => {
        const gap = btnRects.textBgTop - btnRects.copyBottom;
        return gap > 0 ? (
          <div style={{ position: 'fixed', top: btnRects.copyBottom, left: 8, height: gap, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'white' }} />
            <span style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: 'black', padding: '1px 4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', whiteSpace: 'nowrap' }}>{Math.round(gap)}px</span>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'white' }} />
          </div>
        ) : null;
      })()}
      {/* text|bg → bottom of screen (padding) */}
      {btnRects.textBgBottom > 0 && (() => {
        const gap = btnRects.screenBottom - btnRects.textBgBottom;
        return gap > 0 ? (
          <div style={{ position: 'fixed', top: btnRects.textBgBottom, left: 8, height: gap, zIndex: 9999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'white' }} />
            <span style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: 'black', padding: '1px 4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 800, borderRadius: '2px', whiteSpace: 'nowrap' }}>{Math.round(gap)}px</span>
            <div style={{ width: '3px', flex: 1, backgroundColor: 'white' }} />
          </div>
        ) : null;
      })()}
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

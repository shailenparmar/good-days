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
  // Try new format: "txt: #rrggbb h234 s23 l99" or "bg: #rrggbb h234 s23 l99"
  const newFormatMatch = trimmed.match(/^(txt|bg):\s*#[0-9a-f]{6}\s+h(\d+)\s+s(\d+)\s+l(\d+)/i);
  if (newFormatMatch) {
    const type = newFormatMatch[1] as 'txt' | 'bg';
    return { type, h: parseInt(newFormatMatch[2]), s: parseInt(newFormatMatch[3]), l: parseInt(newFormatMatch[4]) };
  }
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
    hue: 215, sat: 100, light: 0, bgHue: 28, bgSat: 100, bgLight: 83,
  });

  // Editing state: seeking = dot free-moving, must dock with target square; adjusting = docked, tilt controls color
  const [editing, setEditing] = useState<'seeking' | 'adjusting' | null>(null);

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

  // Track button engagement for drag-off cancellation
  const buttonEngaged = useRef({ reset: false, copy: false, paste: false });


  // Two-dot system: which color is the active dot during picking
  const [activeDot, setActiveDot] = useState<'text' | 'bg'>('text');
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  // Persist colors
  useEffect(() => {
    localStorage.setItem('mobileColors', JSON.stringify(colors));
  }, [colors]);

  // Update theme-color meta — always black so Safari chrome + safe areas stay black
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    document.head.appendChild(meta);
    document.body.style.setProperty('background-color', '#000000', 'important');
    document.documentElement.style.setProperty('background-color', '#000000', 'important');
  }, []);

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
  const processTouchAt = useCallback((y: number, _source?: string) => {
    // Use whichever bar exists to get the Y mapping
    const bar = activeSide.current === 'left' ? leftBarRef.current : rightBarRef.current;
    if (!bar) {
      return false;
    }

    const rect = bar.getBoundingClientRect();
    const relY = (y - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relY));
    // Gradient is flipped: top = 359°, bottom = 0°
    const newHue = Math.round((1 - clampedY) * 359);

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
    if ((editing !== 'seeking' && editing !== 'adjusting') || !liveTouch.current) return;

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
      // SEEKING: dot moves freely (tiltX/tiltY updated above), check if dot reached target square
      if (editingRef.current === 'seeking') {
        const cur = colorsRef.current;
        const tiltPosX = Math.max(-1, Math.min(1, gammaDelta / maxTilt));
        const tiltPosY = Math.max(-1, Math.min(1, betaDelta / maxTilt));
        // Target square position (the color we're trying to dock with)
        const targetPosX = activeSide.current === 'left'
          ? (cur.sat - 50) / 50
          : (cur.bgSat - 50) / 50;
        const targetPosY = activeSide.current === 'left'
          ? -(cur.light - 50) / 50
          : -(cur.bgLight - 50) / 50;

        // Square-to-square overlap check (AABB collision)
        // Squares are 16px, dotTravel is 116px, so half-size in normalized space = 16 / 2 / 116 ≈ 0.069
        const halfSize = 16 / 2 / 116;
        const overlapX = Math.abs(tiltPosX - targetPosX) < halfSize * 2;
        const overlapY = Math.abs(tiltPosY - targetPosY) < halfSize * 2;

        if (overlapX && overlapY) {
          // Snap baseline so current orientation maps to target position
          // This makes the cursor "become" the target — no color jump on dock
          baseline.current.gamma = gamma - targetPosX * maxTilt;
          baseline.current.beta = beta - targetPosY * maxTilt;
          setTiltX(targetPosX);
          setTiltY(targetPosY);

          setEditing('adjusting');
          if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
        }
      }

      // ADJUSTING: tilt controls active color's sat/light
      if (editingRef.current === 'adjusting') {
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
            // Switching sides - haptic tick, go back to seeking
            if (navigator.vibrate) navigator.vibrate(5);
            activeSide.current = newSide;
            setActiveDot(newSide === 'left' ? 'text' : 'bg');
            setEditing('seeking');
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
    setActiveDot(side === 'left' ? 'text' : 'bg');

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

    setEditing('seeking');
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
    const text = `txt: ${hslToHex(colors.hue, colors.sat, colors.light)} h${colors.hue % 360} s${colors.sat} l${colors.light}\nbg: ${hslToHex(colors.bgHue, colors.bgSat, colors.bgLight)} h${colors.bgHue % 360} s${colors.bgSat} l${colors.bgLight}`;
    // Textarea + execCommand for plain text copy on iOS (clipboard API URL-encodes in iMessage)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('writingSuggestions', 'false');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.contentEditable = 'false';
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;background:transparent;opacity:0.01;font-size:16px;-webkit-user-select:text;user-select:text;-webkit-touch-callout:none;';
    document.body.appendChild(ta);
    ta.contentEditable = 'true'; // briefly editable for execCommand
    ta.focus();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.contentEditable = 'false';
    ta.blur();
    document.body.removeChild(ta);
    // Clear any residual iOS text interaction state
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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

  // Pure hue gradient - 0° at bottom, 359° at top (ROYGBIV bottom to top)
  const pureHueGradient = `linear-gradient(to top,
    hsl(0, 100%, 50%),
    hsl(60, 100%, 50%),
    hsl(120, 100%, 50%),
    hsl(180, 100%, 50%),
    hsl(240, 100%, 50%),
    hsl(300, 100%, 50%),
    hsl(359, 100%, 50%)
  )`;

  // Set tilt button press state
  const [setTiltPressed, setSetTiltPressed] = useState(false);

  // Title hold to show version
  const [titlePressed, setTitlePressed] = useState(false);
  const mobileVersion = '1.10.53';

  // Shared title style - one line, as big as possible
  const titleStyle: React.CSSProperties = {
    color: textColor, fontFamily: 'monospace', fontWeight: 800,
    fontSize: 'min(17vw, 70px)', lineHeight: 1, padding: '16px 0 0', textAlign: 'center', whiteSpace: 'nowrap',
  };

  // Check if touch is inside element bounds
  const isTouchInside = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return false;
    const rect = e.currentTarget.getBoundingClientRect();
    return touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
  };

  // Corner bracket length
  const cornerLen = 32;
  const cornerW = 4;

  // Corner brackets - 4 L-shaped pieces at corners
  const cornerBrackets = (_size: number, color: string, showLabels?: boolean) => {
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
            <span style={{ ...labelStyle, top: 0, left: '50%', transform: 'translate(-50%, -100%)' }}>white</span>
            <span style={{ ...labelStyle, top: 'auto', bottom: 0, left: '50%', transform: 'translate(-50%, 100%)' }}>black</span>
            <span style={{ ...labelStyle, left: 0, top: '50%', transform: 'translate(-100%, -50%)' }}>gray</span>
            <span style={{ ...labelStyle, right: 0, left: 'auto', top: '50%', transform: 'translate(100%, -50%)' }}>vivid</span>
          </>
        )}
      </>
    );
  };

  // X marker helper - two crossed diagonal bars (not live, seeking/target)
  const xMarker = (posX: number, posY: number, color: string, travel: number, size: number = 20) => (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${size}px`,
      height: `${size}px`,
      transform: `translate(calc(-50% + ${posX * travel}px), calc(-50% + ${posY * travel}px))`,
      willChange: 'transform',
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'absolute', width: '100%', height: `${cornerW}px`, backgroundColor: color, top: '50%', left: 0, transform: 'translateY(-50%) rotate(45deg)' }} />
      <div style={{ position: 'absolute', width: '100%', height: `${cornerW}px`, backgroundColor: color, top: '50%', left: 0, transform: 'translateY(-50%) rotate(-45deg)' }} />
    </div>
  );

  // Dot marker helper - filled circle (LIVE, actively adjusting)
  const dotMarker = (posX: number, posY: number, color: string, travel: number, size: number = 20) => (
    <div style={{
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

  // Hollow circle marker - outline circle (cursor/target during seeking, home calibration)
  const hollowCircleMarker = (posX: number, posY: number, color: string, travel: number, size: number = 20, borderWidth: number = 4) => (
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

  // Tilt square - two-dot system
  // Home: two X's (text/bg positions) + calibration dot (tilt feedback)
  // Picker: active dot (moves with tilt) + locked X (other color)
  const tiltSquare = (size: number, showLabels?: boolean) => {
    const dotTravel = (size / 2) - 10;

    // Positions derived from color values (sat→X, light→Y inverted)
    const textPosX = (colors.sat - 50) / 50;
    const textPosY = -(colors.light - 50) / 50;
    const bgPosX = (colors.bgSat - 50) / 50;
    const bgPosY = -(colors.bgLight - 50) / 50;

    const isHome = editing === null;
    const isPickerScreen = editing === 'seeking' || editing === 'adjusting';

    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {cornerBrackets(size, textColor, showLabels)}

        {isHome && (
          <>
            {/* Two X's showing text and bg positions (locked) */}
            {xMarker(textPosX, textPosY, textColor, dotTravel)}
            {xMarker(bgPosX, bgPosY, textColor, dotTravel)}
            {/* Hollow circle - moves with tilt, nothing happens */}
            {hollowCircleMarker(tiltX, tiltY, textColor, dotTravel)}
          </>
        )}

        {isPickerScreen && editing === 'seeking' && (
          <>
            {/* SEEKING: hollow circle (cursor) + hollow circle (target) + other X (locked) */}
            {/* Two hollow circles collide → filled circle */}
            {hollowCircleMarker(tiltX, tiltY, textColor, dotTravel)}
            {activeDot === 'text' ? (
              <>
                {hollowCircleMarker(textPosX, textPosY, textColor, dotTravel)}
                {xMarker(bgPosX, bgPosY, textColor, dotTravel)}
              </>
            ) : (
              <>
                {hollowCircleMarker(bgPosX, bgPosY, textColor, dotTravel)}
                {xMarker(textPosX, textPosY, textColor, dotTravel)}
              </>
            )}
          </>
        )}

        {isPickerScreen && editing === 'adjusting' && (
          <>
            {/* ADJUSTING: active dot (LIVE) + other X (locked) */}
            {activeDot === 'text' ? (
              <>
                {dotMarker(textPosX, textPosY, textColor, dotTravel)}
                {xMarker(bgPosX, bgPosY, textColor, dotTravel)}
              </>
            ) : (
              <>
                {dotMarker(bgPosX, bgPosY, textColor, dotTravel)}
                {xMarker(textPosX, textPosY, textColor, dotTravel)}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const isPicking = editing === 'seeking' || editing === 'adjusting';
  const showCalibrate = needsPermission && !permissionGranted;

  // Safe area style — always at least 12px black at top/bottom so the frame is visible
  const safeAreaStyle: React.CSSProperties = {
    paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  };

  // All three screens always rendered (visibility-toggled) for seamless transitions.
  return (
    <>
      {/* ===== CALIBRATE SCREEN (visible when needs permission) ===== */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#000', visibility: showCalibrate ? 'visible' : 'hidden', zIndex: showCalibrate ? 20 : -2, ...safeAreaStyle }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        <span
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>

        {/* Square with just L corners - matches home screen layout */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '252px', height: '252px', position: 'relative' }}>
            {cornerBrackets(252, textColor, false)}
          </div>
        </div>

        {/* Button area - same position as home screen buttons */}
        <div style={{ padding: '0 0 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); setSetTiltPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setSetTiltPressed(false); requestPermission(); }}
            onTouchCancel={() => setSetTiltPressed(false)}
            style={getButtonStyle(setTiltPressed, 'full')}
          >
            calibrate tilt
          </div>

          {/* Placeholder rows to match home screen button stack height */}
          <div style={{ display: 'flex' }}>
            <div style={{ ...getButtonStyle(false, 'left'), visibility: 'hidden' }}>&nbsp;</div>
            <div style={{ ...getButtonStyle(false, 'right'), visibility: 'hidden' }}>&nbsp;</div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ ...getButtonStyle(false, 'left'), visibility: 'hidden' }}>&nbsp;</div>
            <div style={{ ...getButtonStyle(false, 'right'), visibility: 'hidden' }}>&nbsp;</div>
          </div>
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
          backgroundColor: '#000',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          visibility: isPicking ? 'visible' : 'hidden',
          zIndex: isPicking ? 10 : -1,
          ...safeAreaStyle,
        } as React.CSSProperties}
      >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        <span
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>

        {/* Square complex - centered between title and spectrum */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiltSquare(252, editing === 'adjusting')}
        </div>

        {/* Hue bars - sized to match home screen button area */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          {/* Live color values - hex row (with txt:/bg: labels) above, hsl row sitting on top of spectra */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none', zIndex: 3 }}>
            {/* Hex row with labels */}
            <div style={{ display: 'flex' }}>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>txt: {hslToHex(colors.hue, colors.sat, colors.light)}</span>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>bg: {hslToHex(colors.bgHue, colors.bgSat, colors.bgLight)}</span>
            </div>
            {/* HSL row - sits on top of spectra */}
            <div style={{ display: 'flex' }}>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>h{colors.hue % 360} s{Math.min(99, colors.sat)} l{Math.min(99, colors.light)}</span>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>h{colors.bgHue % 360} s{Math.min(99, colors.bgSat)} l{Math.min(99, colors.bgLight)}</span>
            </div>
          </div>
          {/* Invisible buttons set the correct height */}
          <div style={{ visibility: 'hidden', padding: '0 0 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={getButtonStyle(false, 'full')}>&nbsp;</div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left')}>&nbsp;</div><div style={getButtonStyle(false, 'right')}>&nbsp;</div></div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left')}>&nbsp;</div><div style={getButtonStyle(false, 'right')}>&nbsp;</div></div>
          </div>
          {/* Bars overlay - top offset makes room for hex+hsl codes, gradient squishes to fit */}
          <div style={{ position: 'absolute', top: 40, left: 0, right: 0, bottom: 0, display: 'flex' }}>
            {/* Left: text hue bar */}
            <div
              ref={leftBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {(() => { const active = isPicking && activeSide.current === 'left'; const h = active ? 8 : 4; return <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${((359 - colors.hue) / 359) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'black', opacity: 1, pointerEvents: 'none', zIndex: 1 }} />; })()}
            </div>

            {/* Right: background hue bar */}
            <div
              ref={rightBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {(() => { const active = isPicking && activeSide.current === 'right'; const h = active ? 8 : 4; return <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${((359 - colors.bgHue) / 359) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'black', opacity: 1, pointerEvents: 'none', zIndex: 1 }} />; })()}
            </div>

            {/* Black vertical divider - absolutely positioned to guarantee flush with spectra */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '8px', transform: 'translateX(-50%)', backgroundColor: 'black', zIndex: 2 }} />
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
          backgroundColor: '#000',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          visibility: isPicking ? 'hidden' : 'visible',
          zIndex: isPicking ? -1 : 1,
          ...safeAreaStyle,
        } as React.CSSProperties}
      >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        <span
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>

        {/* Square complex - centered between title and buttons */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiltSquare(252, false)}
        </div>

        <div style={{ padding: '0 0 60px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.reset = true; setResetPressed(true); }}
            onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.reset = false; setResetPressed(false); } }}
            onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.reset) handleResetTilt(); buttonEngaged.current.reset = false; setResetPressed(false); }}
            onTouchCancel={() => { buttonEngaged.current.reset = false; setResetPressed(false); }}
            style={getButtonStyle(resetPressed, 'full')}
          >
            recalibrate tilt
          </div>

          <div style={{ display: 'flex' }}>
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
          </div>

          <div style={{ display: 'flex' }}>
            <div
              onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.copy = true; setCopyPressed(true); }}
              onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.copy = false; setCopyPressed(false); } }}
              onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.copy) handleCopy(); buttonEngaged.current.copy = false; setCopyPressed(false); }}
              onTouchCancel={() => { buttonEngaged.current.copy = false; setCopyPressed(false); }}
              style={getButtonStyle(copyPressed, 'left')}
            >
              copy
            </div>
            <div
              onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.paste = true; setPastePressed(true); }}
              onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.paste = false; setPastePressed(false); } }}
              onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.paste) handlePaste(); buttonEngaged.current.paste = false; setPastePressed(false); }}
              onTouchCancel={() => { buttonEngaged.current.paste = false; setPastePressed(false); }}
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

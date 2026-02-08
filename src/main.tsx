import { StrictMode, useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useMobileSync } from './shared/sync/useMobileSync'
import { setItem } from './shared/storage'

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
  const trimmed = input.trim();
  const match = trimmed.match(/^(txt|bg):\s*h(\d+)\s+s(\d+)\s+l(\d+)/i);
  if (match) {
    return { type: match[1].toLowerCase() as 'txt' | 'bg', h: parseInt(match[2]), s: parseInt(match[3]), l: parseInt(match[4]) };
  }
  return null;
}

function MobileScreen() {
  // Color state
  const [colors, setColors] = useState<ColorState>({
    hue: 215, sat: 100, light: 0, bgHue: 28, bgSat: 100, bgLight: 83,
  });

  // Editing state: seeking = dot free-moving, must dock with target square; adjusting = docked, tilt controls color
  const [editing, setEditing] = useState<'adjusting' | null>(null);

  // Touch Y positions for hue indicators (0-1)
  const [, setBgTouchY] = useState(0);
  const [, setTextTouchY] = useState(0);

  // Tilt values for sat/brightness (-1 to 1)
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  // Button press states
  const [resetPressed, setResetPressed] = useState(false);
  const [copyPressed, setCopyPressed] = useState(false);
  const [savePressed, setSavePressed] = useState(false);
  const [pastePressed, setPastePressed] = useState(false);
  const [pasteInvalid, setPasteInvalid] = useState(false);
  const [pressedCandidate, setPressedCandidate] = useState<string | null>(null);

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
  // Which side started the touch (left = background, right = text) — always reflects alpha's side
  const activeSide = useRef<'left' | 'right' | null>(null);
  const trackedTouches = useRef<Map<number, 'left' | 'right'>>(new Map());  // touchId → side
  const alphaTouchId = useRef<number | null>(null);  // which touch is alpha (controls tilt)

  // Track button engagement for drag-off cancellation
  const buttonEngaged = useRef({ reset: false, copy: false, paste: false, save: false });
  const candidateEngaged = useRef<string | null>(null);


  // Two-dot system: which color is the active dot during picking
  const [activeDot, setActiveDot] = useState<'text' | 'bg'>('text');
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // WebSocket live sync
  const sync = useMobileSync();
  const lastWsSendRef = useRef(0);

  // Helper: send current stream-state to desktop (alpha/beta sides)
  const sendCurrentStreamState = useCallback(() => {
    if (sync.pairingState !== 'paired' || !sync.isStreamingRef.current) return;
    const alphaId = alphaTouchId.current;
    if (alphaId === null) return;
    const alphaSide = trackedTouches.current.get(alphaId);
    if (!alphaSide) return;
    const alphaControl = { side: (alphaSide === 'left' ? 'text' : 'background') as 'text' | 'background' };
    // Find beta (any tracked touch that isn't alpha)
    let betaControl: { side: 'text' | 'background' } | null = null;
    for (const [id, side] of trackedTouches.current) {
      if (id !== alphaId) {
        betaControl = { side: side === 'left' ? 'text' : 'background' };
        break;
      }
    }
    sync.sendStreamState(alphaControl, betaControl);
  }, [sync]);

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  // Dismiss "invalid format" on any interaction
  useEffect(() => {
    if (!pasteInvalid) return;
    const dismiss = () => setPasteInvalid(false);
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('touchstart', dismiss, true);
    window.addEventListener('mousedown', dismiss, true);
    return () => {
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('touchstart', dismiss, true);
      window.removeEventListener('mousedown', dismiss, true);
    };
  }, [pasteInvalid]);

  // Persist colors
  useEffect(() => {
    setItem('mobileColors', JSON.stringify(colors));
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

  // Process touch - uses passed side to know which bar, only needs Y position
  const processTouchAt = useCallback((y: number, side: 'left' | 'right', _source?: string) => {
    // Use the specified side's bar to get the Y mapping
    const bar = side === 'left' ? leftBarRef.current : rightBarRef.current;
    if (!bar) {
      return false;
    }

    const rect = bar.getBoundingClientRect();
    const relY = (y - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relY));
    // Gradient is flipped: top = 359°, bottom = 0°
    const newHue = Math.round((1 - clampedY) * 359);

    if (side === 'left') {
      setTextTouchY(clampedY);
      setColors(prev => {
        const next = { ...prev, hue: newHue };
        // Send hue change over WS
        if (sync.isStreamingRef.current && sync.wsRef.current?.readyState === WebSocket.OPEN) {
          const now = Date.now();
          if (now - lastWsSendRef.current >= 16) {
            lastWsSendRef.current = now;
            sync.sendColorUpdate(next);
          }
        }
        return next;
      });
    } else {
      setBgTouchY(clampedY);
      setColors(prev => {
        const next = { ...prev, bgHue: newHue };
        // Send hue change over WS
        if (sync.isStreamingRef.current && sync.wsRef.current?.readyState === WebSocket.OPEN) {
          const now = Date.now();
          if (now - lastWsSendRef.current >= 16) {
            lastWsSendRef.current = now;
            sync.sendColorUpdate(next);
          }
        }
        return next;
      });
    }
    return true;
  }, []);

  // When picker appears, snap indicator to current finger position
  // Poll until ref is actually set - don't rely on arbitrary RAF count
  useEffect(() => {
    if (editing !== 'adjusting' || !liveTouch.current) return;

    let cancelled = false;
    const tryProcess = () => {
      if (cancelled) return;
      const bar = activeSide.current === 'left' ? leftBarRef.current : rightBarRef.current;
      if (bar && liveTouch.current) {
        processTouchAt(liveTouch.current.y, activeSide.current!, 'PICKER_READY');
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

      // ADJUSTING: tilt controls active color's sat/light
      if (editingRef.current === 'adjusting') {
        const tiltNormX = Math.max(-1, Math.min(1, gammaDelta / maxTilt));
        const tiltNormY = Math.max(-1, Math.min(1, betaDelta / maxTilt));

        const newSat = Math.round(50 + tiltNormX * 50);
        const newLight = Math.round(50 - tiltNormY * 50);

        if (activeSide.current === 'left') {
          setColors(prev => {
            const next = {
              ...prev,
              sat: Math.max(0, Math.min(100, newSat)),
              light: Math.max(0, Math.min(100, newLight)),
            };
            // Low-latency WS send (16ms throttle, bypasses React batching)
            if (sync.isStreamingRef.current && sync.wsRef.current?.readyState === WebSocket.OPEN) {
              const now = Date.now();
              if (now - lastWsSendRef.current >= 16) {
                lastWsSendRef.current = now;
                sync.sendColorUpdate(next);
              }
            }
            return next;
          });
        } else {
          setColors(prev => {
            const next = {
              ...prev,
              bgSat: Math.max(0, Math.min(100, newSat)),
              bgLight: Math.max(0, Math.min(100, newLight)),
            };
            // Low-latency WS send (16ms throttle, bypasses React batching)
            if (sync.isStreamingRef.current && sync.wsRef.current?.readyState === WebSocket.OPEN) {
              const now = Date.now();
              if (now - lastWsSendRef.current >= 16) {
                lastWsSendRef.current = now;
                sync.sendColorUpdate(next);
              }
            }
            return next;
          });
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

      const leftBar = leftBarRef.current;
      const rightBar = rightBarRef.current;
      const midX = (leftBar && rightBar)
        ? (leftBar.getBoundingClientRect().right + rightBar.getBoundingClientRect().left) / 2
        : 0;

      // Process all active touches
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const id = touch.identifier;

        if (trackedTouches.current.has(id)) {
          // Known touch — process on its tracked side
          const side = trackedTouches.current.get(id)!;

          // If this is alpha, also handle side-switching (single-finger crossover)
          if (id === alphaTouchId.current && trackedTouches.current.size === 1 && leftBar && rightBar) {
            const newSide = touch.clientX < midX ? 'left' : 'right';
            if (newSide !== side) {
              if (navigator.vibrate) navigator.vibrate(10);
              trackedTouches.current.set(id, newSide);
              activeSide.current = newSide;
              setActiveDot(newSide === 'left' ? 'text' : 'bg');
              // Send stream-state after side switch
              sendCurrentStreamState();
              // Process on new side
              const bar = newSide === 'left' ? leftBar : rightBar;
              if (bar) {
                const barRect = bar.getBoundingClientRect();
                if (touch.clientY < barRect.top) {
                  processTouchAt(barRect.top, newSide, 'MOVE');
                } else {
                  processTouchAt(touch.clientY, newSide, 'MOVE');
                }
              }
              // Update liveTouch for alpha
              liveTouch.current = { x: touch.clientX, y: touch.clientY };
              continue;
            }
          }

          // Normal hue tracking on this touch's side
          const bar = side === 'left' ? leftBarRef.current : rightBarRef.current;
          if (bar) {
            const barRect = bar.getBoundingClientRect();
            if (touch.clientY < barRect.top) {
              processTouchAt(barRect.top, side, 'MOVE');
            } else {
              processTouchAt(touch.clientY, side, 'MOVE');
            }
          }

          // Track alpha's position for picker-ready snap
          if (id === alphaTouchId.current) {
            liveTouch.current = { x: touch.clientX, y: touch.clientY };
          }
        } else if (trackedTouches.current.size < 2 && leftBar && rightBar) {
          // New touch — add as beta if on the other bar
          const newSide = touch.clientX < midX ? 'left' : 'right';
          // Only add if side differs from alpha's side (one finger per bar)
          if (newSide !== activeSide.current) {
            trackedTouches.current.set(id, newSide);
            if (navigator.vibrate) navigator.vibrate(10);
            // Send stream-state with new beta (from move detection)
            sendCurrentStreamState();
            // Process its Y on its bar
            const bar = newSide === 'left' ? leftBar : rightBar;
            if (bar) {
              const barRect = bar.getBoundingClientRect();
              if (touch.clientY < barRect.top) {
                processTouchAt(barRect.top, newSide, 'MOVE');
              } else {
                processTouchAt(touch.clientY, newSide, 'MOVE');
              }
            }
          }
        }
      }
    };

    const handleEnd = (e: TouchEvent) => {
      if (!isTrackingRef.current) return;

      // Remove ended touches from tracking
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const id = touch.identifier;
        trackedTouches.current.delete(id);

        if (id === alphaTouchId.current) {
          // Alpha lifted — check if beta remains
          if (trackedTouches.current.size > 0) {
            // Promote beta to alpha
            const [newAlphaId, newAlphaSide] = trackedTouches.current.entries().next().value!;
            alphaTouchId.current = newAlphaId;
            activeSide.current = newAlphaSide;
            setActiveDot(newAlphaSide === 'left' ? 'text' : 'bg');
            if (navigator.vibrate) navigator.vibrate(10);
            // Send stream-state after promotion (alpha changed, beta gone)
            sendCurrentStreamState();
          } else {
            alphaTouchId.current = null;
          }
        } else if (trackedTouches.current.size > 0) {
          // Beta lifted, alpha continues — send updated stream-state (no beta)
          sendCurrentStreamState();
        }
      }

      // If all touches gone, fully end
      if (trackedTouches.current.size === 0) {
        isTrackingRef.current = false;
        activeSide.current = null;
        alphaTouchId.current = null;
        if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
        setEditing(null);
        liveTouch.current = null;
        barsMounted.current = 0;

        // Stop WS streaming
        sync.stopStream();
      }
    };

    // Detect new beta touches immediately on touchstart (not just on move)
    const handleStart = (e: TouchEvent) => {
      if (!isTrackingRef.current) return;
      const leftBar = leftBarRef.current;
      const rightBar = rightBarRef.current;
      if (!leftBar || !rightBar) return;
      const midX = (leftBar.getBoundingClientRect().right + rightBar.getBoundingClientRect().left) / 2;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const id = touch.identifier;
        if (trackedTouches.current.has(id) || trackedTouches.current.size >= 2) continue;
        const newSide = touch.clientX < midX ? 'left' : 'right';
        if (newSide !== activeSide.current) {
          e.preventDefault();
          trackedTouches.current.set(id, newSide);
          if (navigator.vibrate) navigator.vibrate(10);
          // Send stream-state with new beta
          sendCurrentStreamState();
          const bar = newSide === 'left' ? leftBar : rightBar;
          if (bar) {
            const barRect = bar.getBoundingClientRect();
            if (touch.clientY < barRect.top) {
              processTouchAt(barRect.top, newSide, 'START');
            } else {
              processTouchAt(touch.clientY, newSide, 'START');
            }
          }
        }
      }
    };

    // Handlers attached on mount - always listening
    window.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [processTouchAt, sendCurrentStreamState]);

  // Start picking - begin tracking IMMEDIATELY
  const startPicking = (side: 'left' | 'right') => (e: React.TouchEvent) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(10);
    setActiveDot(side === 'left' ? 'text' : 'bg');

    // Start WS streaming
    if (sync.pairingState === 'paired') {
      sync.startStream(side === 'left' ? 'text' : 'background');
    }

    // Set which side we're controlling
    activeSide.current = side;

    // Record initial touch as alpha
    const touch = e.touches[0];
    const touchId = touch.identifier;
    alphaTouchId.current = touchId;
    trackedTouches.current.clear();
    trackedTouches.current.set(touchId, side);

    // Send initial stream-state (alpha only, no beta)
    if (sync.pairingState === 'paired') {
      sync.sendStreamState({ side: side === 'left' ? 'text' : 'background' }, null);
    }

    // Start tracking IMMEDIATELY - before any state changes
    isTrackingRef.current = true;

    // Store current touch position
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

    setEditing('adjusting');
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
    const text = `txt: h${colors.hue % 360} s${colors.sat} l${colors.light}\nbg: h${colors.bgHue % 360} s${colors.bgSat} l${colors.bgLight}`;
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
        }
      }
      if (found) {
        const newColors = { hue: txtH, sat: txtS, light: txtL, bgHue: bgH, bgSat: bgS, bgLight: bgL };
        setColors(newColors);
        // One-shot sync to paired laptop — relay requires streaming flag,
        // so briefly start/stop a stream to push the color through
        if (sync.pairingState === 'paired') {
          sync.startStream('text');
          sync.sendColorUpdate(newColors);
          sync.stopStream();
        }
      } else {
        setPasteInvalid(true);
      }
    }).catch(() => {});
  };

  // Randomize — tap anywhere outside buttons on home screen
  const handleRandomize = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const newColors: ColorState = {
      hue: Math.floor(Math.random() * 360),
      sat: Math.floor(Math.random() * 101),
      light: Math.floor(Math.random() * 101),
      bgHue: Math.floor(Math.random() * 360),
      bgSat: Math.floor(Math.random() * 101),
      bgLight: Math.floor(Math.random() * 101),
    };
    setColors(newColors);
    // One-shot sync to paired laptop
    if (sync.pairingState === 'paired') {
      sync.startStream('text');
      sync.sendColorUpdate(newColors);
      sync.stopStream();
    }
  };

  // Button style helper - follows style guide with fill on press
  const isLive = sync.pairingState === 'paired';

  const getButtonStyle = (pressed: boolean, position: 'left' | 'right' | 'full' | 'center', role?: 'picker' | 'aux') => {
    const borderColor = `hsla(${colors.hue}, ${colors.sat}%, ${pressed ? 65 : colors.light}%, ${pressed ? 1 : 0.6})`;
    const fillColor = pressed ? `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.2)` : 'transparent';
    // Picker buttons (text|bg) double height, aux buttons (recal, copy/save/paste) half
    const vPad = role === 'picker' ? 28 : role === 'aux' ? 7 : 14;
    const base: React.CSSProperties = {
      flex: (position === 'full') ? undefined : 1,
      width: position === 'full' ? '100%' : undefined,
      padding: `${vPad}px 0`,
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
    } else if (position === 'center') {
      return { ...base, border: `4px solid ${borderColor}`, borderLeftWidth: '2px', borderRightWidth: '2px', borderRadius: '0' };
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
  const mobileVersion = '2.3.4';

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

  // Dot marker helper - filled circle (LIVE, actively adjusting)
  const dotMarker = (posX: number, posY: number, color: string, travel: number, size: number = 40) => (
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
  const hollowCircleMarker = (posX: number, posY: number, color: string, travel: number, size: number = 40, borderWidth: number = 4) => (
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
        {cornerBrackets(size, textColor, showLabels)}

        {isHome && (
          <>
            {/* Single filled dot - tilt feedback */}
            {dotMarker(tiltX, tiltY, textColor, dotTravel)}
          </>
        )}

        {isPickerScreen && (
          <>
            {/* Filled dot = active (being controlled), hollow circle = inactive */}
            {activeDot === 'text' ? (
              <>
                {dotMarker(textPosX, textPosY, textColor, dotTravel)}
                {hollowCircleMarker(bgPosX, bgPosY, textColor, dotTravel)}
              </>
            ) : (
              <>
                {dotMarker(bgPosX, bgPosY, textColor, dotTravel)}
                {hollowCircleMarker(textPosX, textPosY, textColor, dotTravel)}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const isPicking = editing === 'adjusting';
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
        <div style={{ padding: '0 0 44px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 'min(17vw, 70px)', width: '9ch', alignSelf: 'center' }}>
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
            <div style={{ ...getButtonStyle(false, 'left', 'picker'), visibility: 'hidden' }}>&nbsp;</div>
            <div style={{ ...getButtonStyle(false, 'right', 'picker'), visibility: 'hidden' }}>&nbsp;</div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ ...getButtonStyle(false, 'left', 'aux'), visibility: 'hidden' }}>&nbsp;</div>
            <div style={{ ...getButtonStyle(false, 'right', 'aux'), visibility: 'hidden' }}>&nbsp;</div>
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
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>h{colors.hue % 360} s{colors.sat} l{colors.light}</span>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>h{colors.bgHue % 360} s{colors.bgSat} l{colors.bgLight}</span>
            </div>
          </div>
          {/* Invisible buttons set the correct height */}
          <div style={{ visibility: 'hidden', padding: '0 0 44px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 'min(17vw, 70px)', width: '9ch', alignSelf: 'center' }}>
            <div style={getButtonStyle(false, 'full', 'aux')}>&nbsp;</div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left', 'picker')}>&nbsp;</div><div style={getButtonStyle(false, 'right', 'picker')}>&nbsp;</div></div>
            <div style={{ display: 'flex' }}><div style={getButtonStyle(false, 'left', 'aux')}>&nbsp;</div><div style={getButtonStyle(false, 'right', 'aux')}>&nbsp;</div></div>
          </div>
          {/* Bars overlay - top offset makes room for hex+hsl codes, gradient squishes to fit */}
          <div style={{ position: 'absolute', top: 40, left: 0, right: 0, bottom: 0, display: 'flex' }}>
            {/* Left: text hue bar */}
            <div
              ref={leftBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {(() => { const active = isPicking && Array.from(trackedTouches.current.values()).includes('left'); const isAlpha = activeSide.current === 'left'; const h = active ? (isAlpha ? 16 : 8) : 4; return <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${((359 - colors.hue) / 359) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'black', pointerEvents: 'none', zIndex: 1 }} />; })()}
            </div>

            {/* Right: background hue bar */}
            <div
              ref={rightBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {(() => { const active = isPicking && Array.from(trackedTouches.current.values()).includes('right'); const isAlpha = activeSide.current === 'right'; const h = active ? (isAlpha ? 16 : 8) : 4; return <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${((359 - colors.bgHue) / 359) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'black', pointerEvents: 'none', zIndex: 1 }} />; })()}
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}
        onTouchEnd={(e) => { if (!(e.target as HTMLElement).closest('[data-btn]')) handleRandomize(); }}
      >
        <span
          data-btn
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>

        {/* Square complex - centered between title and buttons */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiltSquare(252, false)}
        </div>

        <div style={{ padding: '0 0 44px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 'min(17vw, 70px)', width: '9ch', alignSelf: 'center' }}>
          <div
            data-btn
            onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.reset = true; setResetPressed(true); }}
            onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.reset = false; setResetPressed(false); } }}
            onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.reset) handleResetTilt(); buttonEngaged.current.reset = false; setResetPressed(false); }}
            onTouchCancel={() => { buttonEngaged.current.reset = false; setResetPressed(false); }}
            style={getButtonStyle(resetPressed, 'full', 'aux')}
          >
            recalibrate tilt
          </div>

          <div style={{ display: 'flex' }}>
            <div
              data-btn
              onTouchStart={startPicking('left')}
              style={getButtonStyle(false, 'left', 'picker')}
            >
              text
            </div>
            <div
              data-btn
              onTouchStart={startPicking('right')}
              style={getButtonStyle(false, 'right', 'picker')}
            >
              background
            </div>
          </div>

          {pasteInvalid ? (
            <div data-btn style={getButtonStyle(false, 'full', 'aux')}>
              invalid format
            </div>
          ) : (
            <div style={{ display: 'flex' }}>
              <div
                data-btn
                onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.copy = true; setCopyPressed(true); }}
                onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.copy = false; setCopyPressed(false); } }}
                onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.copy) handleCopy(); buttonEngaged.current.copy = false; setCopyPressed(false); }}
                onTouchCancel={() => { buttonEngaged.current.copy = false; setCopyPressed(false); }}
                style={getButtonStyle(copyPressed, 'left', 'aux')}
              >
                copy
              </div>
              {isLive && (
                <div
                  data-btn
                  onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.save = true; setSavePressed(true); }}
                  onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.save = false; setSavePressed(false); } }}
                  onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.save) { sync.sendSave(); if (navigator.vibrate) navigator.vibrate(10); } buttonEngaged.current.save = false; setSavePressed(false); }}
                  onTouchCancel={() => { buttonEngaged.current.save = false; setSavePressed(false); }}
                  style={getButtonStyle(savePressed, 'center', 'aux')}
                >
                  save
                </div>
              )}
              <div
                data-btn
                onTouchStart={(e) => { e.preventDefault(); buttonEngaged.current.paste = true; setPastePressed(true); }}
                onTouchMove={(e) => { if (!isTouchInside(e)) { buttonEngaged.current.paste = false; setPastePressed(false); } }}
                onTouchEnd={(e) => { e.preventDefault(); if (buttonEngaged.current.paste) handlePaste(); buttonEngaged.current.paste = false; setPastePressed(false); }}
                onTouchCancel={() => { buttonEngaged.current.paste = false; setPastePressed(false); }}
                style={{ ...getButtonStyle(pastePressed, 'right', 'aux'), WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
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
          )}
        </div>
      </div>
      </div>

      {/* ===== PAIRING SCREEN (visible when multiple laptops available) ===== */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#000',
          visibility: sync.pairingState === 'pairing' ? 'visible' : 'hidden',
          zIndex: sync.pairingState === 'pairing' ? 30 : -3,
          ...safeAreaStyle,
        }}
      >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        <span
          style={titleStyle}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressed(true); }}
          onTouchEnd={() => setTitlePressed(false)}
          onTouchCancel={() => setTitlePressed(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '0 24px' }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '20px', color: textColor }}>
            which one is yours?
          </span>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '100%',
            maxWidth: '320px',
          }}>
            {sync.candidates.map((laptop, index) => {
              const cw = laptop.colorway;
              const candidateBg = cw ? `hsl(${cw.bgHue}, ${cw.bgSat}%, ${cw.bgLight}%)` : bgColor;
              const candidateText = cw ? `hsl(${cw.hue}, ${cw.sat}%, ${cw.light}%)` : textColor;
              const h = cw ? cw.hue : colors.hue;
              const s = cw ? cw.sat : colors.sat;
              const l = cw ? cw.light : colors.light;
              const isPressed = pressedCandidate === laptop.id;
              const borderColor = isPressed
                ? `hsla(${h}, ${s}%, 65%, 1)`
                : `hsla(${h}, ${s}%, ${l}%, 0.6)`;
              const background = isPressed
                ? `linear-gradient(hsla(${h}, ${s}%, ${l}%, 0.2), hsla(${h}, ${s}%, ${l}%, 0.2)), ${candidateBg}`
                : candidateBg;
              return (
                <div
                  key={laptop.id}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    candidateEngaged.current = laptop.id;
                    setPressedCandidate(laptop.id);
                    if (navigator.vibrate) navigator.vibrate(10);
                  }}
                  onTouchMove={(e) => {
                    if (!isTouchInside(e)) {
                      candidateEngaged.current = null;
                      setPressedCandidate(null);
                    }
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    if (candidateEngaged.current === laptop.id) {
                      sync.selectCandidate(laptop.id);
                    }
                    candidateEngaged.current = null;
                    setPressedCandidate(null);
                  }}
                  onTouchCancel={() => {
                    candidateEngaged.current = null;
                    setPressedCandidate(null);
                  }}
                  style={{
                    background,
                    border: `4px solid ${borderColor}`,
                    borderRadius: '12px',
                    padding: '14px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: '20px',
                    color: candidateText,
                  }}
                >
                  desktop {index + 1}
                </div>
              );
            })}
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

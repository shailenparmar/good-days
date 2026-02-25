import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMobileSync } from '@shared/sync/useMobileSync';
import { setItem } from '@shared/storage';
import { VERSION } from '@shared/version';
import { TiltSquare, CornerBrackets } from './components/TiltSquare';
import { MobileButton } from './components/MobileButton';
import { hslToHex, parseColorInput, pureHueGradient, isTouchInside } from './utils';
import type { ColorState } from './utils';
import { getStatusColors } from '@shared/utils/confirmColor';

export default function MobileApp() {
  // Color state
  const [colors, setColors] = useState<ColorState>({
    hue: 63, sat: 100, light: 12, bgHue: 52, bgSat: 100, bgLight: 91,
  });

  // Editing state: seeking = dot free-moving, must dock with target square; adjusting = docked, tilt controls color
  const [editing, setEditing] = useState<'adjusting' | null>(null);

  // Tilt values for sat/brightness (-1 to 1)
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  // Button press states
  const [pasteInvalid, setPasteInvalid] = useState(false);

  const [skipPressed, setSkipPressed] = useState(false);
  const skipEngaged = useRef(false);

  // Code entry state
  const [codeInput, setCodeInput] = useState('');
  const [codeFlash, setCodeFlash] = useState<'none' | 'red'>('none');
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Bold sweep placeholder for code input ("pairing code")
  const [codeBoldCount, setCodeBoldCount] = useState(0);
  const [codeBoldPhase, setCodeBoldPhase] = useState<'bold' | 'unbold'>('bold');
  const codePlaceholder = 'pairing code';
  const [codeInputFocused, setCodeInputFocused] = useState(false);
  const [codeInputPressed, setCodeInputPressed] = useState(false);
  const showCodePlaceholder = codeInput.length === 0 && !codeInputFocused;
  useEffect(() => {
    if (!showCodePlaceholder) return;
    if (codeBoldCount >= codePlaceholder.length) {
      setCodeBoldPhase(p => p === 'bold' ? 'unbold' : 'bold');
      setCodeBoldCount(0);
      return;
    }
    const timer = setTimeout(() => setCodeBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [showCodePlaceholder, codeBoldCount, codeBoldPhase]);
  useEffect(() => {
    if (showCodePlaceholder) { setCodeBoldCount(0); setCodeBoldPhase('bold'); }
  }, [showCodePlaceholder]);

  // Track code input focus via document-level events (iOS doesn't reliably blur on tap-away)
  useEffect(() => {
    const check = () => setCodeInputFocused(document.activeElement === codeInputRef.current);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);

  // Mock screen for visual testing (?mock=code)
  const [mockScreen] = useState(() => new URLSearchParams(window.location.search).get('mock'));

  // Flickering digits removed — code entry title is now plain "good days"

  // iOS permission state — always starts on permission screen, useEffect auto-skips if data is flowing
  const [needsPermission, setNeedsPermission] = useState(() => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    return typeof DOE.requestPermission === 'function';
  });
  const [permissionGranted, setPermissionGranted] = useState(() => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    return typeof DOE.requestPermission !== 'function';
  });
  // Auto-detect motion permission: if data is already flowing, skip permission screen
  useEffect(() => {
    if (permissionGranted || !needsPermission) return;

    let cancelled = false;

    const testListener = (e: DeviceOrientationEvent) => {
      if (e.beta !== null || e.gamma !== null) {
        if (!cancelled) {
          localStorage.setItem('motionPermissionGranted', '1');
          setNeedsPermission(false);
          setPermissionGranted(true);
        }
        window.removeEventListener('deviceorientation', testListener);
      }
    };

    window.addEventListener('deviceorientation', testListener);

    return () => {
      cancelled = true;
      window.removeEventListener('deviceorientation', testListener);
    };
  }, [permissionGranted, needsPermission]);

  // Refs
  const baseline = useRef({ beta: 0, gamma: 0 });
  const rawOrientation = useRef({ beta: 0, gamma: 0 });
  const baselineCaptured = useRef(false);
  const isCalibratingRef = useRef(false);
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

  // Two-dot system: which color is the active dot during picking
  const [activeDot, setActiveDot] = useState<'text' | 'bg'>('text');
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // WebSocket live sync
  const sync = useMobileSync();
  const lastWsSendRef = useRef(0);

  // Throttled WS color update (42ms = ~24fps)
  const sendColorThrottled = useCallback((next: ColorState) => {
    if (!sync.isStreamingRef.current || sync.wsRef.current?.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastWsSendRef.current >= 42) {
      lastWsSendRef.current = now;
      sync.sendColorUpdate(next);
    }
  }, []);

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

  // Persist colors — skip during picking for performance.
  // At 60fps picking, XOR-encrypted localStorage writes push the frame budget.
  // When picking ends, editing flips null → this dep changes → effect saves.
  useEffect(() => {
    if (editing) return;
    setItem('mobileColors', JSON.stringify(colors));
  }, [colors, editing]);

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

  // Request permission
  const requestPermission = async () => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result === 'granted') {
          localStorage.setItem('motionPermissionGranted', '1');
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

    setColors(prev => {
      const next = side === 'left'
        ? { ...prev, hue: newHue }
        : { ...prev, bgHue: newHue };
      sendColorThrottled(next);
      return next;
    });
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

      // Live calibration: re-zero every frame while button is held
      if (isCalibratingRef.current) {
        baseline.current.beta = beta;
        baseline.current.gamma = gamma;
      }

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

        const isText = activeSide.current === 'left';
        setColors(prev => {
          const next = isText
            ? { ...prev, sat: Math.max(0, Math.min(100, newSat)), light: Math.max(0, Math.min(100, newLight)) }
            : { ...prev, bgSat: Math.max(0, Math.min(100, newSat)), bgLight: Math.max(0, Math.min(100, newLight)) };
          sendColorThrottled(next);
          return next;
        });
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

    setEditing('adjusting');
  };

  // Copy
  const handleCopy = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    const text = `txt: ${hslToHex(colors.hue % 360, colors.sat, colors.light)} h${colors.hue % 360} s${colors.sat} l${colors.light}\nbg: ${hslToHex(colors.bgHue % 360, colors.bgSat, colors.bgLight)} h${colors.bgHue % 360} s${colors.bgSat} l${colors.bgLight}`;
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

  // Clear code input when leaving enter-code state
  useEffect(() => {
    if (sync.pairingState !== 'enter-code') {
      setCodeInput('');
      setCodeFlash('none');
    }
  }, [sync.pairingState]);

  // No auto-focus — let the 000 bold sweep placeholder show on load.
  // User taps the input to focus, which hides the placeholder.

  // Triple red flash on wrong code — input clears immediately
  useEffect(() => {
    if (sync.codeRejectedCount === 0) return;
    setCodeInput('');
    setCodeFlash('red');
    const t1 = setTimeout(() => setCodeFlash('none'), 80);
    const t2 = setTimeout(() => setCodeFlash('red'), 160);
    const t3 = setTimeout(() => setCodeFlash('none'), 240);
    const t4 = setTimeout(() => setCodeFlash('red'), 320);
    const t5 = setTimeout(() => {
      setCodeFlash('none');
      codeInputRef.current?.focus();
    }, 400);
    return () => { [t1, t2, t3, t4, t5].forEach(clearTimeout); };
  }, [sync.codeRejectedCount]);

  const { error: errorColor } = useMemo(
    () => getStatusColors(colors.hue, colors.sat, colors.light, colors.bgHue, colors.bgSat, colors.bgLight),
    [colors.hue, colors.sat, colors.light, colors.bgHue, colors.bgSat, colors.bgLight]
  );

  // Button style helper - follows style guide with fill on press
  const isLive = sync.pairingState === 'paired';

  const getButtonStyle = (pressed: boolean, position: 'left' | 'right' | 'full' | 'center', role?: 'picker' | 'aux') => {
    const borderColor = `hsla(${colors.hue}, ${colors.sat}%, ${pressed ? 65 : colors.light}%, ${pressed ? 1 : 0.6})`;
    const fillColor = pressed ? `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.2)` : 'transparent';
    // Picker buttons (text|bg) double height, aux buttons (recal, copy/save/paste) half
    const vPad = role === 'picker' ? 28 : role === 'aux' ? 7 : 14;
    // All-longhand border properties to avoid React shorthand/longhand reconciliation bug.
    // Using border shorthand + borderRightWidth override causes React to drop the override
    // on re-render when only the shorthand value changes (color/opacity), widening dividers.
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
      borderStyle: 'solid',
      borderColor: borderColor,
      borderTopWidth: '4px',
      borderBottomWidth: '4px',
    };
    if (position === 'left') {
      return { ...base, borderLeftWidth: '4px', borderRightWidth: '2px', borderRadius: '12px 0 0 12px' };
    } else if (position === 'right') {
      return { ...base, borderLeftWidth: '2px', borderRightWidth: '4px', borderRadius: '0 12px 12px 0' };
    } else if (position === 'center') {
      return { ...base, borderLeftWidth: '2px', borderRightWidth: '2px', borderRadius: '0' };
    }
    return { ...base, borderLeftWidth: '4px', borderRightWidth: '4px', borderRadius: '12px' };
  };

  const [recalPressed, setRecalPressed] = useState(false);

  // Title hold to show version — persists across refresh so you don't have to re-press
  const [titlePressed, setTitlePressed] = useState(() => sessionStorage.getItem('titlePressed') === '1');
  const setTitlePressedPersist = (v: boolean) => {
    setTitlePressed(v);
    if (v) sessionStorage.setItem('titlePressed', '1');
    else sessionStorage.removeItem('titlePressed');
  };
  const mobileVersion = VERSION;

  // Shared title style - one line, as big as possible
  const titleStyle: React.CSSProperties = {
    color: textColor, fontFamily: 'monospace', fontWeight: 800,
    fontSize: 'min(17vw, 70px)', lineHeight: 1, padding: '16px 0 0', textAlign: 'center', whiteSpace: 'nowrap',
  };

  const isPicking = editing === 'adjusting';
  const showCalibrate = needsPermission && !permissionGranted;
  const showHome = (sync.pairingState === 'paired' || sync.pairingState === 'standalone') && !isPicking;

  // Hue bar indicator — horizontal line showing current hue position
  const renderHueIndicator = (side: 'left' | 'right', hue: number) => {
    const active = isPicking && Array.from(trackedTouches.current.values()).includes(side);
    const isAlpha = activeSide.current === side;
    const h = active ? (isAlpha ? 16 : 8) : 4;
    return <div style={{ position: 'absolute', left: side === 'right' ? 2 : 0, right: side === 'left' ? 2 : 0, top: `calc(${((359 - hue) / 359) * 100}% - ${h / 2}px)`, height: `${h}px`, backgroundColor: 'rgba(0, 0, 0, 0.6)', pointerEvents: 'none', zIndex: 5 }} />;
  };

  // Safe area style — always at least 12px black at top/bottom so the frame is visible
  const safeAreaStyle: React.CSSProperties = {
    paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  };

  // Title component shared across all screens
  const title = (
    <span
      style={titleStyle}
      onTouchStart={(e) => { e.preventDefault(); setTitlePressedPersist(true); }}
      onTouchEnd={() => setTitlePressedPersist(false)}
      onTouchCancel={() => setTitlePressedPersist(false)}
    >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>
  );

  // Picker title — "good days" with no version on hold
  const pickerTitle = (
    <span style={titleStyle}>good days</span>
  );

  // Preset 1 colors for base canvas (hardcoded)
  const baseTextColor = 'hsl(63, 100%, 12%)';
  const baseBgColor = 'hsl(52, 100%, 91%)';

  // All screens always rendered (visibility-toggled) for seamless transitions.
  return (
    <>
      {/* ===== BASE CANVAS (always visible, natural z-order bottom) ===== */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#000', ...safeAreaStyle }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: baseBgColor }}>
        <span
          style={{ ...titleStyle, color: baseTextColor }}
          onTouchStart={(e) => { e.preventDefault(); setTitlePressedPersist(true); }}
          onTouchEnd={() => setTitlePressedPersist(false)}
          onTouchCancel={() => setTitlePressedPersist(false)}
        >{titlePressed ? `v${mobileVersion}` : 'good days'}</span>
      </div>
      </div>

      {/* ===== CALIBRATE SCREEN (visible when needs permission) ===== */}
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#000', visibility: showCalibrate ? 'visible' : 'hidden', zIndex: showCalibrate ? 30 : -2, ...safeAreaStyle }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}>
        {title}

        {/* Square with just L corners - matches home screen layout */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '252px', height: '252px', position: 'relative' }}>
            <CornerBrackets size={252} color={textColor} showLabels={false} />
          </div>
        </div>

        {/* Button area - same position as home screen buttons */}
        <div style={{ padding: '0 0 44px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 'min(17vw, 70px)', width: '9ch', alignSelf: 'center', position: 'relative' }}>
          <MobileButton
            onActivate={requestPermission}
            style={getButtonStyle(false, 'full')}
            getStyle={(pressed) => getButtonStyle(pressed, 'full')}
          >
            allow motion access
          </MobileButton>

          {/* Placeholder rows to match home screen button stack height.
             "allow motion access" is standard (14px) vs home's recalibrate aux (7px) = 14px taller.
             Compensate by removing padding from the last invisible row. */}
          <div style={{ display: 'flex' }}>
            <div style={{ ...getButtonStyle(false, 'left', 'picker'), visibility: 'hidden' }}>&nbsp;</div>
            <div style={{ ...getButtonStyle(false, 'right', 'picker'), visibility: 'hidden' }}>&nbsp;</div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ ...getButtonStyle(false, 'left', 'aux'), visibility: 'hidden', padding: '0 0' }}>&nbsp;</div>
            <div style={{ ...getButtonStyle(false, 'right', 'aux'), visibility: 'hidden', padding: '0 0' }}>&nbsp;</div>
          </div>
          {/* Copyright - absolutely positioned in the 44px bottom padding, no layout impact */}
          <p style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', textAlign: 'center', color: textColor, opacity: 0.85, margin: 0 }}>
            {'\u00A9 2026 shailen parmar'}
          </p>
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
        {pickerTitle}

        {/* Square complex - centered between title and spectrum */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TiltSquare size={252} showLabels={editing === 'adjusting'} colors={colors} editing={editing} activeDot={activeDot} tiltX={tiltX} tiltY={tiltY} textColor={textColor} />
        </div>

        {/* Hue bars - sized to match home screen button area */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          {/* Live color values - 2 columns centered above respective spectra */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40px', display: 'flex', pointerEvents: 'none', zIndex: 3 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>
              <div>txt: {hslToHex(colors.hue % 360, colors.sat, colors.light)}</div>
              <div>h{colors.hue % 360} s{colors.sat} l{colors.light}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: textColor }}>
              <div>bg: {hslToHex(colors.bgHue % 360, colors.bgSat, colors.bgLight)}</div>
              <div>h{colors.bgHue % 360} s{colors.bgSat} l{colors.bgLight}</div>
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
              {renderHueIndicator('left', colors.hue)}
            </div>

            {/* Right: background hue bar */}
            <div
              ref={rightBarRef}
              style={{ flex: 1, position: 'relative', background: pureHueGradient, overflow: 'hidden' }}
            >
              {renderHueIndicator('right', colors.bgHue)}
            </div>

            {/* Black vertical divider - absolutely positioned to guarantee flush with spectra */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '4px', transform: 'translateX(-50%)', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 2 }} />
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
          visibility: showHome ? 'visible' : 'hidden',
          zIndex: showHome ? 10 : -1,
          ...safeAreaStyle,
        } as React.CSSProperties}
      >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}
      >
        {title}

        {/* Square complex - centered between title and buttons (tap to randomize) */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onTouchEnd={() => handleRandomize()}
        >
          <TiltSquare size={252} showLabels={false} colors={colors} editing={editing} activeDot={activeDot} tiltX={tiltX} tiltY={tiltY} textColor={textColor} />
        </div>

        <div style={{ padding: '0 0 44px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 'min(17vw, 70px)', width: '9ch', alignSelf: 'center' }}>
          <div
            onTouchStart={(e) => {
              e.preventDefault();
              isCalibratingRef.current = true;
              setRecalPressed(true);
              if (navigator.vibrate) navigator.vibrate(10);
            }}
            onTouchMove={(e) => {
              const inside = isTouchInside(e);
              isCalibratingRef.current = inside;
              setRecalPressed(inside);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              isCalibratingRef.current = false;
              setRecalPressed(false);
            }}
            onTouchCancel={() => {
              isCalibratingRef.current = false;
              setRecalPressed(false);
            }}
            style={getButtonStyle(recalPressed, 'full', 'aux')}
          >
            recalibrate
          </div>

          <div style={{ display: 'flex' }}>
            <div
              onTouchStart={startPicking('left')}
              style={getButtonStyle(false, 'left', 'picker')}
            >
              text
            </div>
            <div
              onTouchStart={startPicking('right')}
              style={getButtonStyle(false, 'right', 'picker')}
            >
              background
            </div>
          </div>

          {pasteInvalid ? (
            <div style={{ ...getButtonStyle(false, 'full', 'aux'), color: errorColor, borderColor: errorColor }}>
              invalid format
            </div>
          ) : (
            <div style={{ display: 'flex' }}>
              <MobileButton
                onActivate={handleCopy}
                style={getButtonStyle(false, 'left', 'aux')}
                getStyle={(pressed) => getButtonStyle(pressed, 'left', 'aux')}
              >
                copy
              </MobileButton>
              {isLive && (
                <MobileButton
                  onActivate={() => { sync.sendSave(colors); if (navigator.vibrate) navigator.vibrate(10); }}
                  style={getButtonStyle(false, 'center', 'aux')}
                  getStyle={(pressed) => getButtonStyle(pressed, 'center', 'aux')}
                >
                  save
                </MobileButton>
              )}
              <MobileButton
                onActivate={handlePaste}
                style={getButtonStyle(false, 'right', 'aux')}
                getStyle={(pressed) => ({ ...getButtonStyle(pressed, 'right', 'aux'), WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties)}
                extraProps={{
                  role: 'button',
                  tabIndex: -1,
                  writingSuggestions: 'false',
                  contentEditable: false,
                  spellCheck: false,
                }}
              >
                <span style={{ pointerEvents: 'none' }}>{'p'}{'a'}{'s'}{'t'}{'e'}</span>
              </MobileButton>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* ===== CODE ENTRY SCREEN (visible when not auto-paired) ===== */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#000',
          visibility: (sync.pairingState === 'enter-code' || mockScreen === 'code') ? 'visible' : 'hidden',
          zIndex: (sync.pairingState === 'enter-code' || mockScreen === 'code') ? 20 : -3,
          ...safeAreaStyle,
        }}
      >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: bgColor }}
      >
        {title}

        {/* Square with just L corners - matches home screen layout */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ width: '252px', height: '252px', position: 'relative' }}>
            <CornerBrackets size={252} color={textColor} showLabels={false} />
          </div>
        </div>

        {/* Button area — invisible home screen buttons set exact height, visible code entry buttons overlaid */}
        <div style={{ position: 'relative', padding: '0 0 44px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 'min(17vw, 70px)', width: '9ch', alignSelf: 'center' }}>
          {/* Invisible home screen button structure — guarantees pixel-perfect height match */}
          <div style={({ ...getButtonStyle(false, 'full', 'aux'), visibility: 'hidden' } as React.CSSProperties)}>&nbsp;</div>
          <div style={{ display: 'flex', visibility: 'hidden' }}>
            <div style={getButtonStyle(false, 'left', 'picker')}>&nbsp;</div>
            <div style={getButtonStyle(false, 'right', 'picker')}>&nbsp;</div>
          </div>
          <div style={{ display: 'flex', visibility: 'hidden' }}>
            <div style={getButtonStyle(false, 'left', 'aux')}>&nbsp;</div>
            <div style={getButtonStyle(false, 'right', 'aux')}>&nbsp;</div>
          </div>
          {/* Visible code entry buttons — absolutely positioned over invisible structure */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'relative' }}>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={codeInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                  setCodeInput(val);
                  if (codeFlash !== 'none') setCodeFlash('none');
                  if (val.length === 3) {
                    sync.pairByCode(val);
                  }
                }}
                style={{
                  ...getButtonStyle(codeInputPressed, 'full', 'picker'),
                  backgroundColor: codeInputPressed ? `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.2)` : 'transparent',
                  border: `4px solid ${codeFlash === 'red' ? errorColor : `hsla(${colors.hue}, ${colors.sat}%, ${codeInputPressed ? 65 : colors.light}%, ${codeInputPressed ? 1 : 0.6})`}`,
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                  caretColor: codeInput.length >= 3 ? 'transparent' : textColor,
                  letterSpacing: '4px',
                  textIndent: '4px',
                }}
                onClick={(e) => { const el = e.currentTarget; const len = el.value.length; el.setSelectionRange(len, len); }}
                onTouchStart={() => setCodeInputPressed(true)}
                onTouchMove={(e) => { if (!isTouchInside(e)) setCodeInputPressed(false); }}
                onTouchEnd={() => setCodeInputPressed(false)}
                onTouchCancel={() => setCodeInputPressed(false)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {showCodePlaceholder && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  fontSize: '20px',
                  color: textColor,
                  opacity: 0.85,
                  whiteSpace: 'pre',
                  pointerEvents: 'none',
                }}>
                  {codeBoldPhase === 'bold' ? (
                    <>
                      <span style={{ fontWeight: 900 }}>{codePlaceholder.slice(0, codeBoldCount)}</span>
                      <span style={{ fontWeight: 400 }}>{codePlaceholder.slice(codeBoldCount)}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 400 }}>{codePlaceholder.slice(0, codeBoldCount)}</span>
                      <span style={{ fontWeight: 900 }}>{codePlaceholder.slice(codeBoldCount)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={{ height: '24px' }} />
            <div
              onTouchStart={(e) => {
                codeInputRef.current?.blur();
                e.preventDefault();
                skipEngaged.current = true;
                setSkipPressed(true);
                if (navigator.vibrate) navigator.vibrate(10);
              }}
              onTouchMove={(e) => {
                if (!isTouchInside(e)) {
                  skipEngaged.current = false;
                  setSkipPressed(false);
                }
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                if (skipEngaged.current) sync.skipPairing();
                skipEngaged.current = false;
                setSkipPressed(false);
              }}
              onTouchCancel={() => {
                if (skipEngaged.current) sync.skipPairing();
                skipEngaged.current = false;
                setSkipPressed(false);
              }}
              style={getButtonStyle(skipPressed, 'full', 'picker')}
            >
              skip
            </div>
          </div>
        </div>
      </div>
      </div>

    </>
  );
}

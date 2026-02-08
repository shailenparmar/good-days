import { useEffect, useRef, useState, useCallback } from 'react';
import { createLeaderElection } from './leaderElection';
import { getWsUrl } from './protocol';
import type { ServerMessage, ClientMessage, ColorPayload } from './protocol';

const SECRET_KEY = 'wsSecret';
const DEVICE_ID_KEY = 'wsDeviceId';
const PARTNER_DEVICE_ID_KEY = 'wsPartnerDeviceId';
const GRACE_MS = 200;

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export interface WebSyncState {
  livePreset: ColorPayload | null;
  streamSide: 'text' | 'background' | null;
  isStreaming: boolean;
  streamingControls: { alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null } | null;
  saveRequested: number;
}

export interface UseWebSyncOptions {
  onColorUpdate?: (colors: ColorPayload) => void;
}

export function useWebSync(currentColorway: ColorPayload | undefined, options?: UseWebSyncOptions) {
  const onColorUpdateRef = useRef(options?.onColorUpdate);
  onColorUpdateRef.current = options?.onColorUpdate;
  const [state, setState] = useState<WebSyncState>({
    livePreset: null,
    streamSide: null,
    isStreaming: false,
    streamingControls: null,
    saveRequested: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const isLeaderRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const destroyLeaderRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const lastWsActivityRef = useRef(Date.now());
  const hiddenAtRef = useRef(0);
  const colorwayRef = useRef(currentColorway);
  colorwayRef.current = currentColorway;

  const sendMsg = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!isLeaderRef.current || !mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = getWsUrl();
    if (!url) return;

    const secret = localStorage.getItem(SECRET_KEY) || undefined;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ws-sync] connected to', url);
        backoffRef.current = 1000;
        lastWsActivityRef.current = Date.now();
        // Cancel any pending reconnect timer — connection succeeded before it fired
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        // Clear grace timer on reconnect
        if (graceTimer.current) {
          clearTimeout(graceTimer.current);
          graceTimer.current = null;
        }

        const colorway = colorwayRef.current || undefined;
        console.log('[ws-sync] registering as laptop, secret=', secret || 'none');
        sendMsg({
          type: 'register',
          role: 'laptop',
          secret,
          colorway,
          deviceId: getOrCreateDeviceId(),
          partnerDeviceId: localStorage.getItem(PARTNER_DEVICE_ID_KEY) || undefined,
        });

        // If this window is already focused, claim the laptop immediately.
        // The focus event only fires on GAINING focus — on initial page load
        // the window is already focused so no focus event fires.
        if (document.hasFocus()) {
          sendMsg({ type: 'claim-laptop' });
        }
      };

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        lastWsActivityRef.current = Date.now();
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch { return; }

        console.log('[ws-sync] received:', msg.type, msg);
        switch (msg.type) {
          case 'paired':
            localStorage.setItem(SECRET_KEY, msg.secret);
            if (msg.partnerDeviceId) {
              localStorage.setItem(PARTNER_DEVICE_ID_KEY, msg.partnerDeviceId);
            }
            // Initialize live preset with current laptop colors
            if (colorwayRef.current) {
              setState(prev => ({
                ...prev,
                livePreset: prev.livePreset || { ...colorwayRef.current! },
              }));
            }
            break;

          case 'unpaired':
            startGrace();
            break;

          case 'color-update':
            setState(prev => ({
              ...prev,
              livePreset: msg.colors,
            }));
            // Direct callback — bypasses React effect chain for low-latency path
            onColorUpdateRef.current?.(msg.colors);
            break;

          case 'stream-start':
            setState(prev => ({
              ...prev,
              streamSide: msg.side,
              isStreaming: true,
            }));
            break;

          case 'stream-stop':
            setState(prev => ({
              ...prev,
              isStreaming: false,
              streamingControls: null,
            }));
            break;

          case 'stream-state':
            setState(prev => ({
              ...prev,
              streamingControls: { alpha: msg.alpha, beta: msg.beta },
            }));
            break;

          case 'save-preset':
            setState(prev => ({
              ...prev,
              saveRequested: prev.saveRequested + 1,
            }));
            break;
        }
      };

      ws.onclose = (ev) => {
        console.log('[ws-sync] closed, code=', ev.code, 'reason=', ev.reason);
        // Only clear ref and reconnect if this is still the active WS.
        // Prevents a stale onclose from nulling a newer connection's ref
        // (race: visibility/leader change creates new WS before old onclose fires).
        if (wsRef.current === ws) {
          wsRef.current = null;
          startGrace();
          scheduleReconnect();
        }
      };

      ws.onerror = (ev) => {
        console.log('[ws-sync] error', ev);
        ws.close();
      };
    } catch {
      scheduleReconnect();
    }
  }, [sendMsg]);

  const startGrace = useCallback(() => {
    if (graceTimer.current) return;
    graceTimer.current = setTimeout(() => {
      graceTimer.current = null;
      if (mountedRef.current) {
        setState(prev => ({ livePreset: null, streamSide: null, isStreaming: false, streamingControls: null, saveRequested: prev.saveRequested }));
      }
    }, GRACE_MS);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    if (!isLeaderRef.current || !mountedRef.current) return;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, 10000);
  }, [connect]);

  // Leader election + connection lifecycle
  useEffect(() => {
    mountedRef.current = true;

    const election = createLeaderElection(
      () => {
        isLeaderRef.current = true;
        connect();
      },
      () => {
        isLeaderRef.current = false;
        wsRef.current?.close();
        wsRef.current = null;
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      },
    );
    destroyLeaderRef.current = election.destroy;

    // Cross-browser focus claim: when this window gains focus, tell the relay
    // to transfer the phone pairing here. BroadcastChannel only works within
    // a single browser — this handles Chrome ↔ Safari switching on the desktop.
    const handleFocus = () => {
      if (isLeaderRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        sendMsg({ type: 'claim-laptop' });
      }
    };
    window.addEventListener('focus', handleFocus);

    // Wake-from-sleep / PWA-resume detection: when the page becomes visible,
    // check if the WebSocket needs reconnecting. Three triggers:
    // 1. stale: no WS activity in 45s (missed a server ping cycle)
    // 2. dead: wsRef is null or readyState > OPEN
    // 3. pwaFrozen: PWA was hidden > 3s — Chrome freezes backgrounded PWAs
    //    and kills the WS server-side, but readyState still shows OPEN
    //    (onclose never fires for frozen pages). Don't trust readyState.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== 'visible' || !isLeaderRef.current) return;

      const stale = Date.now() - lastWsActivityRef.current > 45_000;
      const dead = !wsRef.current || wsRef.current.readyState > WebSocket.OPEN;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as { standalone?: boolean }).standalone === true;
      const pwaFrozen = isStandalone && hiddenAtRef.current > 0
        && (Date.now() - hiddenAtRef.current > 3_000);

      if (stale || dead || pwaFrozen) {
        console.log('[ws-sync] wake detected, reconnecting (stale=%s, dead=%s, pwaFrozen=%s)', stale, dead, pwaFrozen);
        hiddenAtRef.current = 0;
        backoffRef.current = 1000;
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Periodic stale detection: catches dead connections even when
    // the tab stays hidden (minimized window, secondary monitor).
    // Complements the visibilitychange handler which only runs on show.
    const staleCheckInterval = setInterval(() => {
      if (!isLeaderRef.current || !mountedRef.current) return;
      const stale = Date.now() - lastWsActivityRef.current > 45_000;
      const dead = !wsRef.current || wsRef.current.readyState > WebSocket.OPEN;
      if (stale || dead) {
        console.log('[ws-sync] periodic stale check: reconnecting (stale=%s, dead=%s)', stale, dead);
        backoffRef.current = 1000;
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        connect();
      }
    }, 60_000);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(staleCheckInterval);
      election.destroy();
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, [connect]);

  return state;
}

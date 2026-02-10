import { useEffect, useRef, useState, useCallback } from 'react';
import { getWsUrl } from './protocol';
import type { ServerMessage, ClientMessage, ColorPayload } from './protocol';

const DEVICE_ID_KEY = 'wsDeviceId';
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
  pairingCode: string | null;
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
    pairingCode: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);
  const dormantRef = useRef(false); // Set when superseded (close code 4001)
  const lastWsActivityRef = useRef(Date.now());
  const hiddenAtRef = useRef(0);
  const colorwayRef = useRef(currentColorway);
  colorwayRef.current = currentColorway;
  const pairingCodeRef = useRef<string | null>(null);

  const sendMsg = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (dormantRef.current || !mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = getWsUrl();
    if (!url) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ws-sync] connected to', url);
        backoffRef.current = 1000;
        lastWsActivityRef.current = Date.now();
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        if (graceTimer.current) {
          clearTimeout(graceTimer.current);
          graceTimer.current = null;
        }

        console.log('[ws-sync] registering as laptop');
        sendMsg({
          type: 'register',
          role: 'laptop',
          deviceId: getOrCreateDeviceId(),
        });
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
          case 'registered':
            if (msg.pairingCode) {
              pairingCodeRef.current = msg.pairingCode;
            }
            break;

          case 'code-visible':
            setState(prev => ({
              ...prev,
              pairingCode: msg.visible ? pairingCodeRef.current : null,
            }));
            break;

          case 'paired':
            pairingCodeRef.current = null;
            setState(prev => ({
              ...prev,
              pairingCode: null,
              livePreset: prev.livePreset || (colorwayRef.current ? { ...colorwayRef.current } : prev.livePreset),
            }));
            break;

          case 'unpaired':
            startGrace();
            break;

          case 'color-update':
            setState(prev => prev.livePreset ? prev : { ...prev, livePreset: msg.colors });
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
        if (wsRef.current === ws) {
          wsRef.current = null;

          if (ev.code === 4001) {
            // Superseded by another tab — go dormant, never reconnect
            dormantRef.current = true;
            setState(prev => ({ livePreset: null, streamSide: null, isStreaming: false, streamingControls: null, saveRequested: prev.saveRequested, pairingCode: null }));
            return;
          }

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
        setState(prev => ({ livePreset: null, streamSide: null, isStreaming: false, streamingControls: null, saveRequested: prev.saveRequested, pairingCode: prev.pairingCode }));
      }
    }, GRACE_MS);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    if (dormantRef.current || !mountedRef.current) return;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, 10000);
  }, [connect]);

  // Connection lifecycle — connect immediately on mount (no leader election)
  useEffect(() => {
    mountedRef.current = true;
    dormantRef.current = false;
    connect();

    // Wake-from-sleep / PWA-resume detection
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== 'visible') return;

      // Dormant tab (superseded by another tab) wakes up when user switches back.
      // Clear dormant flag and reconnect — relay will supersede the other tab.
      if (dormantRef.current) {
        console.log('[ws-sync] dormant tab became visible, reclaiming connection');
        dormantRef.current = false;
        backoffRef.current = 1000;
        connect();
        return;
      }

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

    // Periodic stale detection
    const staleCheckInterval = setInterval(() => {
      if (dormantRef.current || !mountedRef.current) return;
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
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(staleCheckInterval);
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

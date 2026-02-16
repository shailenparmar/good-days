import { useEffect, useRef, useState, useCallback } from 'react';
import { getWsUrl } from './protocol';
import type { ServerMessage, ClientMessage, ColorPayload } from './protocol';

const DEVICE_ID_KEY = 'wsDeviceId2';

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export type PairingState = 'connecting' | 'paired' | 'enter-code' | 'standalone';

export interface MobileSyncHandle {
  pairingState: PairingState;
  pairByCode: (code: string) => void;
  skipPairing: () => void;

  startStream: (side: 'text' | 'background') => void;
  stopStream: () => void;
  sendColorUpdate: (colors: ColorPayload) => void;
  sendStreamState: (alpha: { side: 'text' | 'background' }, beta: { side: 'text' | 'background' } | null) => void;
  sendSave: (colors: ColorPayload) => void;
  codeRejectedCount: number;
  wsRef: React.RefObject<WebSocket | null>;
  isStreamingRef: React.RefObject<boolean>;
}

export function useMobileSync(): MobileSyncHandle {
  const [pairingState, setPairingState] = useState<PairingState>('connecting');
  const [codeRejectedCount, setCodeRejectedCount] = useState(0);
  const pairingStateRef = useRef<PairingState>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const isStreamingRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);
  const hiddenRef = useRef(false);
  const skippedPairingRef = useRef(false);

  const sendMsg = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || skippedPairingRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = getWsUrl();
    if (!url) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[mobile-sync] connected to', url);
        backoffRef.current = 1000;
        pairingStateRef.current = 'standalone'; // Reset so first enter-code isn't a false rejection
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        console.log('[mobile-sync] registering as phone');
        sendMsg({
          type: 'register',
          role: 'phone',
          deviceId: getOrCreateDeviceId(),
        });
      };

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch { return; }

        switch (msg.type) {
          case 'paired':
            pairingStateRef.current = 'paired';
            setPairingState('paired');
            break;

          case 'unpaired':
            pairingStateRef.current = 'standalone';
            setPairingState('standalone');
            isStreamingRef.current = false;
            break;


          case 'enter-code':
            if (pairingStateRef.current === 'enter-code') {
              setCodeRejectedCount(c => c + 1);
            }
            pairingStateRef.current = 'enter-code';
            setPairingState('enter-code');
            break;
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          isStreamingRef.current = false;
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      scheduleReconnect();
    }
  }, [sendMsg]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    if (!mountedRef.current || hiddenRef.current || skippedPairingRef.current) return;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, 10000);
  }, [connect]);

  const pairByCode = useCallback((code: string) => {
    sendMsg({ type: 'pair-by-code', code });
  }, [sendMsg]);

  const startStream = useCallback((side: 'text' | 'background') => {
    isStreamingRef.current = true;
    sendMsg({ type: 'stream-start', side });
  }, [sendMsg]);

  const stopStream = useCallback(() => {
    isStreamingRef.current = false;
    sendMsg({ type: 'stream-stop' });
  }, [sendMsg]);

  const sendColorUpdate = useCallback((colors: ColorPayload) => {
    sendMsg({ type: 'color-update', colors });
  }, [sendMsg]);

  const sendStreamState = useCallback((alpha: { side: 'text' | 'background' }, beta: { side: 'text' | 'background' } | null) => {
    sendMsg({ type: 'stream-state', alpha, beta });
  }, [sendMsg]);

  const sendSave = useCallback((colors: ColorPayload) => {
    sendMsg({ type: 'save-preset', colors });
  }, [sendMsg]);

  const skipPairing = useCallback(() => {
    skippedPairingRef.current = true;
    setPairingState('standalone');
    wsRef.current?.close();
    wsRef.current = null;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  // Connect on mount + disconnect/reconnect on visibility change
  useEffect(() => {
    mountedRef.current = true;
    connect();

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenRef.current = true;
        // Send going-hidden before close — ws.send() data frames are buffered
        // synchronously by the OS, while ws.close() requires a handshake that
        // iOS may never complete before freezing the page. This lets the relay
        // immediately unpair instead of waiting for the 30-60s ping timeout.
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'going-hidden' }));
        }
        wsRef.current?.close();
        wsRef.current = null;
        isStreamingRef.current = false;
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        backoffRef.current = 1000;
      } else if (document.visibilityState === 'visible') {
        hiddenRef.current = false;
        skippedPairingRef.current = false;
        backoffRef.current = 1000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, [connect]);

  return {
    pairingState,
    pairByCode,
    skipPairing,
    startStream,
    stopStream,
    sendColorUpdate,
    sendStreamState,
    sendSave,
    codeRejectedCount,
    wsRef,
    isStreamingRef,
  };
}

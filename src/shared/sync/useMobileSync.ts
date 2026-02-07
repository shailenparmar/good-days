import { useEffect, useRef, useState, useCallback } from 'react';
import { getWsUrl } from './protocol';
import type { ServerMessage, ClientMessage, ColorPayload } from './protocol';

const IP_CACHE_KEY = 'wsPublicIp';
const SECRET_KEY = 'wsSecret';

async function fetchPublicIp(): Promise<string> {
  const cached = sessionStorage.getItem(IP_CACHE_KEY);
  if (cached) return cached;
  try {
    const resp = await fetch('https://api.ipify.org?format=text');
    const ip = await resp.text();
    sessionStorage.setItem(IP_CACHE_KEY, ip.trim());
    return ip.trim();
  } catch {
    return 'unknown';
  }
}

export type PairingState = 'standalone' | 'pairing' | 'paired';

export interface Candidate {
  id: string;
  colorway?: ColorPayload;
}

export interface MobileSyncHandle {
  pairingState: PairingState;
  candidates: Candidate[];
  selectCandidate: (id: string) => void;
  startStream: (side: 'text' | 'background') => void;
  stopStream: () => void;
  sendColorUpdate: (colors: ColorPayload) => void;
  sendStreamState: (alpha: { side: 'text' | 'background' }, beta: { side: 'text' | 'background' } | null) => void;
  sendSave: () => void;
  wsRef: React.RefObject<WebSocket | null>;
  isStreamingRef: React.RefObject<boolean>;
}

export function useMobileSync(): MobileSyncHandle {
  const [pairingState, setPairingState] = useState<PairingState>('standalone');
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const isStreamingRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const sendMsg = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = getWsUrl();
    if (!url) return;

    const ip = await fetchPublicIp();
    const secret = localStorage.getItem(SECRET_KEY) || undefined;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[mobile-sync] connected to', url);
        backoffRef.current = 1000;
        console.log('[mobile-sync] registering as phone, ip=', ip, 'secret=', secret || 'none');
        sendMsg({
          type: 'register',
          role: 'phone',
          publicIp: ip,
          secret,
        });
      };

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch { return; }

        console.log('[mobile-sync] received:', msg.type, msg);
        switch (msg.type) {
          case 'paired':
            localStorage.setItem(SECRET_KEY, msg.secret);
            setPairingState('paired');
            setCandidates([]);
            break;

          case 'unpaired':
            setPairingState('standalone');
            isStreamingRef.current = false;
            break;

          case 'no-candidates':
            setPairingState('standalone');
            break;

          case 'candidates':
            setPairingState('pairing');
            setCandidates(msg.laptops);
            break;

          case 'candidate-update':
            setCandidates(prev =>
              prev.map(c => c.id === msg.laptopId ? { ...c, colorway: msg.colorway } : c)
            );
            break;
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        isStreamingRef.current = false;
        scheduleReconnect();
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
    if (!mountedRef.current) return;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, backoffRef.current);
    backoffRef.current = Math.min(backoffRef.current * 2, 10000);
  }, [connect]);

  const selectCandidate = useCallback((id: string) => {
    sendMsg({ type: 'pair-request', targetId: id });
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

  const sendSave = useCallback(() => {
    sendMsg({ type: 'save-preset' });
  }, [sendMsg]);

  // Connect on mount + disconnect/reconnect on visibility change
  useEffect(() => {
    mountedRef.current = true;
    connect();

    // When phone goes to home screen, close WS immediately so desktop exits live fast.
    // When phone comes back, reconnect.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Close immediately — desktop's 500ms grace will clear live state
        wsRef.current?.close();
        wsRef.current = null;
        isStreamingRef.current = false;
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        backoffRef.current = 1000;
      } else if (document.visibilityState === 'visible') {
        // Reconnect immediately
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
    candidates,
    selectCandidate,
    startStream,
    stopStream,
    sendColorUpdate,
    sendStreamState,
    sendSave,
    wsRef,
    isStreamingRef,
  };
}

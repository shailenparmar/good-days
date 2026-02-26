import type { WebSocket } from 'ws';

export interface ColorPayload {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
}

// Client → Server messages
export type ClientMessage =
  | { type: 'register'; role: 'phone' | 'laptop'; deviceId?: string }
  | { type: 'pair-by-code'; code: string }

  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset'; colors: ColorPayload }
  | { type: 'going-hidden' }
  | { type: 'heartbeat' };

// Server → Client messages
export type ServerMessage =
  | { type: 'registered'; clientId: string; pairingCode?: string }
  | { type: 'paired'; partnerId: string }
  | { type: 'enter-code' }
  | { type: 'unpaired'; reason: string }

  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset'; colors: ColorPayload };

export interface ClientRecord {
  ws: WebSocket;
  role: 'phone' | 'laptop';
  publicIp: string;
  partnerId?: string;
  streaming: boolean;
  deviceId?: string;
  connectedAt: number;
  lastHeartbeat: number;
  heartbeatReceived: boolean;
  pairingCode?: string;
  // Stream state snapshots (stored on phone records for handoff replay)
  lastColors?: ColorPayload;
  lastStreamSide?: 'text' | 'background';
  lastStreamState?: {
    alpha: { side: 'text' | 'background' };
    beta: { side: 'text' | 'background' } | null;
  };
}

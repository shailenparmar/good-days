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
  | { type: 'pair-request'; targetId: string }
  | { type: 'pair-by-code'; code: string }

  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset' };

// Server → Client messages
export type ServerMessage =
  | { type: 'registered'; clientId: string; pairingCode?: string }
  | { type: 'paired'; partnerId: string }
  | { type: 'enter-code' }
  | { type: 'unpaired'; reason: string }
  | { type: 'candidates'; laptops: Array<{ id: string; connectedAgo: number }> }

  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset' };

export interface ClientRecord {
  ws: WebSocket;
  role: 'phone' | 'laptop';
  publicIp: string;
  partnerId?: string;
  streaming: boolean;
  deviceId?: string;
  connectedAt: number;
  pairingCode?: string;
  // Stream state snapshots (stored on phone records for handoff replay)
  lastColors?: ColorPayload;
  lastStreamSide?: 'text' | 'background';
  lastStreamState?: {
    alpha: { side: 'text' | 'background' };
    beta: { side: 'text' | 'background' } | null;
  };
}

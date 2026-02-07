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
  | { type: 'register'; role: 'phone' | 'laptop'; publicIp: string; secret?: string; colorway?: ColorPayload; deviceId?: string; partnerDeviceId?: string }
  | { type: 'pair-request'; targetId: string }
  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset' }
  | { type: 'claim-laptop' };

// Server → Client messages
export type ServerMessage =
  | { type: 'registered'; clientId: string }
  | { type: 'paired'; partnerId: string; secret: string; partnerDeviceId?: string }
  | { type: 'unpaired'; reason: string }
  | { type: 'candidates'; laptops: Array<{ id: string; colorway?: ColorPayload }> }
  | { type: 'candidate-update'; laptopId: string; colorway: ColorPayload }
  | { type: 'no-candidates' }
  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset' };

export interface ClientRecord {
  ws: WebSocket;
  role: 'phone' | 'laptop';
  publicIp: string;
  secret?: string;
  partnerId?: string;
  colorway?: ColorPayload;
  streaming: boolean;
  // Persistent device identity (for learned pairing affinity)
  deviceId?: string;
  // Remembered partner from client (for learned pairing affinity)
  partnerDeviceId?: string;
  // Last time this laptop sent claim-laptop (used to pick focused browser)
  lastClaimTime?: number;
  // Stream state snapshots (stored on phone records for handoff replay)
  lastColors?: ColorPayload;
  lastStreamSide?: 'text' | 'background';
  lastStreamState?: {
    alpha: { side: 'text' | 'background' };
    beta: { side: 'text' | 'background' } | null;
  };
}

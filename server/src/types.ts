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
  | { type: 'register'; role: 'phone' | 'laptop'; publicIp: string; secret?: string; colorway?: ColorPayload }
  | { type: 'pair-request'; targetId: string }
  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset' };

// Server → Client messages
export type ServerMessage =
  | { type: 'registered'; clientId: string }
  | { type: 'paired'; partnerId: string; secret: string }
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
}

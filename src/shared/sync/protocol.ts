export interface ColorPayload {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
}

// Client → Server
export type ClientMessage =
  | { type: 'register'; role: 'phone' | 'laptop'; publicIp: string; secret?: string; colorway?: ColorPayload }
  | { type: 'pair-request'; targetId: string }
  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset' }
  | { type: 'claim-laptop' };

// Server → Client
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

export function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const loc = window.location;
  // Production: use relay subdomain
  if (loc.hostname === 'gdays.day' || loc.hostname === 'www.gdays.day') {
    return 'wss://relay.gdays.day/ws';
  }
  // Dev: use Vite proxy (same host)
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws`;
}

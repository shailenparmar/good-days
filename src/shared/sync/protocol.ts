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
  | { type: 'register'; role: 'phone' | 'laptop'; deviceId?: string }
  | { type: 'pair-by-code'; code: string }

  | { type: 'color-update'; colors: ColorPayload }
  | { type: 'stream-start'; side: 'text' | 'background' }
  | { type: 'stream-stop' }
  | { type: 'stream-state'; alpha: { side: 'text' | 'background' }; beta: { side: 'text' | 'background' } | null }
  | { type: 'save-preset'; colors: ColorPayload };

// Server → Client
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

export function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  // Electron loads from file:// — always use the production relay
  if (window.electronAPI?.platform === 'electron') {
    return 'wss://relay.gdays.day/ws';
  }
  const loc = window.location;
  // Production: use relay subdomain
  if (loc.hostname === 'gdays.day' || loc.hostname === 'www.gdays.day') {
    return 'wss://relay.gdays.day/ws';
  }
  // Dev: use Vite proxy (same host)
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws`;
}

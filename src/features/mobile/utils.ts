export type ColorState = {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
};

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function parseColorInput(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^(txt|bg):\s*#[0-9a-f]{6}\s+h(\d+)\s+s(\d+)\s+l(\d+)/i);
  if (match) {
    return { type: match[1].toLowerCase() as 'txt' | 'bg', h: parseInt(match[2]), s: parseInt(match[3]), l: parseInt(match[4]) };
  }
  return null;
}

// Check if touch is inside element bounds
export function isTouchInside(e: React.TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return false;
  const rect = e.currentTarget.getBoundingClientRect();
  return touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
}

// Pure hue gradient - 0° at bottom, 359° at top (ROYGBIV bottom to top)
export const pureHueGradient = `linear-gradient(to top,
  hsl(0, 100%, 50%),
  hsl(60, 100%, 50%),
  hsl(120, 100%, 50%),
  hsl(180, 100%, 50%),
  hsl(240, 100%, 50%),
  hsl(300, 100%, 50%),
  hsl(359, 100%, 50%)
)`;

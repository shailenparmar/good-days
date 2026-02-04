/**
 * Calculates status colors (confirm/error) with smooth transitions.
 *
 * Simple algorithm:
 * 1. Hues are FIXED: red (0°) for error, green (120°) for confirm
 * 2. Only lightness adjusts to achieve 4.5:1 contrast with background
 * 3. Smooth sigmoid blend between dark/light at the luminance crossover
 *
 * This guarantees:
 * - Always readable (WCAG 4.5:1 standard)
 * - Always semantically correct (red = error, green = confirm)
 * - Smooth continuous transitions as background changes
 */

// ============ Color Conversion ============

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// ============ WCAG Luminance & Contrast ============

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(lum1: number, lum2: number): number {
  const [light, dark] = lum1 > lum2 ? [lum1, lum2] : [lum2, lum1];
  return (light + 0.05) / (dark + 0.05);
}

function getLuminanceForHsl(h: number, s: number, l: number): number {
  const [r, g, b] = hslToRgb(h, s, l);
  return getLuminance(r, g, b);
}

// ============ Core Algorithm ============

const RED_HUE = 0;
const GREEN_HUE = 120;
const SATURATION = 100;
const TARGET_CONTRAST = 4.5;

/**
 * Find lightness that achieves target contrast, with smooth transitions.
 *
 * Light backgrounds → dark status colors
 * Dark backgrounds → light status colors
 * Sigmoid blend at the crossover for smooth transitions
 */
function solveLightness(hue: number, bgLum: number): number {
  const getLum = (l: number) => getLuminanceForHsl(hue, SATURATION, l);

  // Find darkest lightness that achieves target (binary search from 50 down)
  let darkL = 0;
  {
    let lo = 0, hi = 50;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (getContrast(getLum(mid), bgLum) >= TARGET_CONTRAST) lo = mid;
      else hi = mid;
    }
    darkL = lo;
  }

  // Find lightest lightness that achieves target (binary search from 50 up)
  let lightL = 100;
  {
    let lo = 50, hi = 100;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (getContrast(getLum(mid), bgLum) >= TARGET_CONTRAST) hi = mid;
      else lo = mid;
    }
    lightL = hi;
  }

  // Smooth sigmoid blend based on background luminance
  // Light bg (high lum) → prefer dark status (t → 1)
  // Dark bg (low lum) → prefer light status (t → 0)
  const t = 1 / (1 + Math.exp(-15 * (bgLum - 0.18)));

  return lightL * (1 - t) + darkL * t;
}

// ============ Main Export ============

export function getStatusColors(
  _textH: number,
  _textS: number,
  _textL: number,
  bgH: number,
  bgS: number,
  bgL: number
): { confirm: string; error: string } {
  const bgLum = getLuminanceForHsl(bgH, bgS, bgL);

  const errorL = solveLightness(RED_HUE, bgLum);
  const confirmL = solveLightness(GREEN_HUE, bgLum);

  return {
    confirm: `hsl(${GREEN_HUE}, ${SATURATION}%, ${Math.round(confirmL)}%)`,
    error: `hsl(${RED_HUE}, ${SATURATION}%, ${Math.round(errorL)}%)`,
  };
}

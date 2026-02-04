/**
 * Calculates status colors (confirm/error) that are always readable and
 * visually distinct from both the background and the user's text color.
 *
 * Algorithm:
 * 1. Hue avoidance: if the ideal hue (green/red) is too close to the text
 *    color, smoothly shift toward a fallback hue on the opposite side.
 *    Two fallbacks per color ensure the shift always goes AWAY from text.
 * 2. Lightness solver: binary search for dark and light solutions that meet
 *    the contrast target, then sigmoid blend based on background luminance.
 * 3. Contrast safety net: if the sigmoid blend lands in the dead zone
 *    (mid-tone backgrounds), snap to whichever direction gives better contrast.
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

// ============ Constants ============

const RED_HUE = 0;
const GREEN_HUE = 120;
const SATURATION = 100;
const TARGET_CONTRAST = 3.5;
const MIN_HUE_DISTANCE = 60;

// Two fallbacks per color: CW (clockwise) and CCW (counter-clockwise).
// The algorithm picks the one on the opposite side of the ideal from text,
// so the lerp path always moves AWAY from the text hue.
const CONFIRM_FB_CW = 210;   // blue — when text is CCW from green (e.g. ~80°)
const CONFIRM_FB_CCW = 60;   // yellow-green — when text is CW from green (e.g. ~150°)
const ERROR_FB_CW = 50;      // orange — when text is CCW from red (e.g. ~330°)
const ERROR_FB_CCW = 310;    // magenta — when text is CW from red (e.g. ~30°)

// ============ Hue Avoidance ============

function hueDist(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
}

function lerpHue(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return ((a + diff * t) % 360 + 360) % 360;
}

/**
 * If the ideal hue is within MIN_HUE_DISTANCE of the text hue,
 * smoothly blend toward a fallback. The fallback is chosen on the
 * opposite side of the ideal from the text, so the path never crosses
 * through the text hue.
 */
function adjustHue(
  idealHue: number,
  fbCW: number,
  fbCCW: number,
  textHue: number,
): number {
  const dist = hueDist(idealHue, textHue);
  if (dist >= MIN_HUE_DISTANCE) return idealHue;

  // Which side is text? CW degrees from ideal to text.
  const cwDist = ((textHue - idealHue) % 360 + 360) % 360;
  // Text is CW → push CCW (and vice versa)
  const fallback = cwDist <= 180 ? fbCCW : fbCW;

  // Smoothstep: 0 at zone edge, 1 at dead center
  const t = 1 - dist / MIN_HUE_DISTANCE;
  const smooth = t * t * (3 - 2 * t);

  return lerpHue(idealHue, fallback, smooth);
}

// ============ Lightness Solver ============

/**
 * Find lightness that achieves target contrast, with smooth transitions.
 *
 * Light backgrounds → dark status colors
 * Dark backgrounds → light status colors
 * Sigmoid blend at the crossover for smooth transitions
 *
 * Safety net: if the sigmoid blend produces a value that doesn't meet
 * contrast (happens on mid-tone backgrounds), snap to whichever direction
 * gives better contrast.
 */
function solveLightness(hue: number, bgLum: number): number {
  const getLum = (l: number) => getLuminanceForHsl(hue, SATURATION, l);

  // Find darkest lightness that achieves target (binary search 0-50)
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

  // Find lightest lightness that achieves target (binary search 50-100)
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
  const t = 1 / (1 + Math.exp(-15 * (bgLum - 0.18)));
  let result = lightL * (1 - t) + darkL * t;

  // Safety net: verify contrast, snap if blend failed
  if (getContrast(getLum(result), bgLum) < TARGET_CONTRAST) {
    const dc = getContrast(getLum(darkL), bgLum);
    const lc = getContrast(getLum(lightL), bgLum);
    result = dc >= lc ? darkL : lightL;
  }

  return result;
}

// ============ Main Export ============

export function getStatusColors(
  textH: number,
  _textS: number,
  _textL: number,
  bgH: number,
  bgS: number,
  bgL: number
): { confirm: string; error: string } {
  const bgLum = getLuminanceForHsl(bgH, bgS, bgL);

  const confirmHue = Math.round(adjustHue(GREEN_HUE, CONFIRM_FB_CW, CONFIRM_FB_CCW, textH));
  const errorHue = Math.round(adjustHue(RED_HUE, ERROR_FB_CW, ERROR_FB_CCW, textH));

  const confirmL = solveLightness(confirmHue, bgLum);
  const errorL = solveLightness(errorHue, bgLum);

  return {
    confirm: `hsl(${confirmHue}, ${SATURATION}%, ${Math.round(confirmL)}%)`,
    error: `hsl(${errorHue}, ${SATURATION}%, ${Math.round(errorL)}%)`,
  };
}

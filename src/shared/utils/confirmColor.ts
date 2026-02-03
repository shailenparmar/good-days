/**
 * Calculates optimal status colors (confirm/error) using WCAG contrast ratios.
 *
 * Algorithm:
 * 1. Start with ideal hue (red=0° for error, green=120° for confirm)
 * 2. Find lightness that achieves 4.5:1 contrast with background
 * 3. If hue conflicts with text, shift minimally
 *
 * This guarantees:
 * - Readable against background (WCAG 4.5:1 standard)
 * - Distinguishable from text
 * - Semantic colors preserved when possible
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

function getContrastRatio(lum1: number, lum2: number): number {
  const [light, dark] = lum1 > lum2 ? [lum1, lum2] : [lum2, lum1];
  return (light + 0.05) / (dark + 0.05);
}

function getLuminanceForHsl(h: number, s: number, l: number): number {
  const [r, g, b] = hslToRgb(h, s, l);
  return getLuminance(r, g, b);
}

// ============ Core Algorithm ============

/**
 * Find lightness that achieves target contrast ratio with background.
 * Starts at 50% (most vibrant) and searches outward toward the extreme
 * that provides more contrast. Returns the LEAST extreme lightness that
 * still achieves the target contrast.
 */
function findLightnessForContrast(
  hue: number,
  sat: number,
  bgLuminance: number,
  targetRatio: number
): number {
  // Determine which direction increases contrast
  // Light background → darker colors have more contrast (search toward 0)
  // Dark background → lighter colors have more contrast (search toward 100)
  const bgIsLight = bgLuminance > 0.179; // ~45% gray

  // Start at 50% and search outward toward the contrasting extreme
  for (let offset = 0; offset <= 50; offset++) {
    const l = bgIsLight ? (50 - offset) : (50 + offset);
    const lum = getLuminanceForHsl(hue, sat, l);
    const ratio = getContrastRatio(lum, bgLuminance);

    if (ratio >= targetRatio) {
      return l;
    }
  }

  // If 50% offset wasn't enough, return the extreme
  return bgIsLight ? 0 : 100;
}

/**
 * Calculate hue distance on circular color wheel (0-180)
 */
function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * Shift hue away from a target hue by minimum distance.
 * Chooses direction that maximizes distance from avoid hue.
 */
function shiftHueAway(hue: number, avoid: number, minDist: number = 60): number {
  if (hueDistance(hue, avoid) >= minDist) return hue;

  const cw = (hue + minDist) % 360;
  const ccw = (hue - minDist + 360) % 360;

  return hueDistance(cw, avoid) > hueDistance(ccw, avoid) ? cw : ccw;
}

// ============ Main Export ============

const RED_HUE = 0;
const GREEN_HUE = 120;
const SATURATION = 100;
const TARGET_CONTRAST_RATIO = 4.5; // WCAG AA standard
const MIN_HUE_DISTANCE = 60; // Minimum hue separation for distinguishability
const CHROMATIC_THRESHOLD = 30; // Below this saturation, hue is meaningless

export function getStatusColors(
  textH: number,
  textS: number,
  _textL: number, // Available for future luminance-based text distinction
  bgH: number,
  bgS: number,
  bgL: number
): { confirm: string; error: string } {
  // Calculate background luminance
  const bgLuminance = getLuminanceForHsl(bgH, bgS, bgL);

  // Determine if text hue matters (only if chromatic)
  const textIsChromatic = textS > CHROMATIC_THRESHOLD;

  // Error: start with red
  let errorHue = RED_HUE;
  if (textIsChromatic && hueDistance(errorHue, textH) < MIN_HUE_DISTANCE) {
    errorHue = shiftHueAway(errorHue, textH, MIN_HUE_DISTANCE);
  }
  const errorL = findLightnessForContrast(errorHue, SATURATION, bgLuminance, TARGET_CONTRAST_RATIO);

  // Confirm: start with green
  let confirmHue = GREEN_HUE;
  if (textIsChromatic && hueDistance(confirmHue, textH) < MIN_HUE_DISTANCE) {
    confirmHue = shiftHueAway(confirmHue, textH, MIN_HUE_DISTANCE);
  }
  // Also ensure confirm is different from error
  if (hueDistance(confirmHue, errorHue) < MIN_HUE_DISTANCE) {
    confirmHue = shiftHueAway(confirmHue, errorHue, MIN_HUE_DISTANCE);
  }
  const confirmL = findLightnessForContrast(confirmHue, SATURATION, bgLuminance, TARGET_CONTRAST_RATIO);

  return {
    confirm: `hsl(${Math.round(confirmHue)}, ${SATURATION}%, ${Math.round(confirmL)}%)`,
    error: `hsl(${Math.round(errorHue)}, ${SATURATION}%, ${Math.round(errorL)}%)`,
  };
}

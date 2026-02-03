/**
 * Calculates optimal confirm (success) and error colors that:
 * - Are as close to bright GREEN (confirm) and RED (error) as possible
 * - Only deviate when there's actual chromatic conflict (saturation > 30%)
 * - Have lightness that contrasts with the background
 *
 * Key insight: If a color is achromatic (low saturation), its hue is meaningless.
 * Black text, white text, gray backgrounds — their hues shouldn't constrain us.
 */

const GREEN_HUE = 120;
const RED_HUE = 0;
const MIN_HUE_DISTANCE = 45; // Minimum degrees of separation for visibility
const CHROMATIC_THRESHOLD = 30; // Below this saturation, hue is meaningless

/**
 * Calculate distance between two hues on the circular color wheel (0-180)
 */
function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * Calculate minimum distance from a hue to any of the avoid hues
 */
function minDistanceToAvoid(candidate: number, avoidHues: number[]): number {
  if (avoidHues.length === 0) return 180; // No constraints
  return Math.min(...avoidHues.map(avoid => hueDistance(candidate, avoid)));
}

/**
 * Check if a hue is safe (far enough from all hues to avoid)
 */
function isSafeHue(candidate: number, avoidHues: number[]): boolean {
  return minDistanceToAvoid(candidate, avoidHues) >= MIN_HUE_DISTANCE;
}

/**
 * Find the closest hue to the target that's safe from all avoid hues.
 * Expands symmetrically from target. When both directions are safe at the same
 * offset, picks the one with MORE distance from avoid hues (better contrast).
 */
function findClosestSafeHue(targetHue: number, avoidHues: number[]): number {
  // If no constraints, use the target directly
  if (avoidHues.length === 0) {
    return targetHue;
  }

  // Try the target first
  if (isSafeHue(targetHue, avoidHues)) {
    return targetHue;
  }

  // Expand outward from target, checking both directions at each offset
  for (let offset = 1; offset <= 180; offset++) {
    const clockwise = (targetHue + offset) % 360;
    const counterClockwise = (targetHue - offset + 360) % 360;

    const cwSafe = isSafeHue(clockwise, avoidHues);
    const ccwSafe = isSafeHue(counterClockwise, avoidHues);

    if (cwSafe && ccwSafe) {
      // Both safe at same distance from target — pick the one with more contrast
      const cwDist = minDistanceToAvoid(clockwise, avoidHues);
      const ccwDist = minDistanceToAvoid(counterClockwise, avoidHues);
      return cwDist >= ccwDist ? clockwise : counterClockwise;
    } else if (cwSafe) {
      return clockwise;
    } else if (ccwSafe) {
      return counterClockwise;
    }
  }

  // Fallback: return target anyway (shouldn't happen with MIN_HUE_DISTANCE < 120)
  return targetHue;
}

export function getStatusColors(
  textHue: number,
  textSat: number,
  bgHue: number,
  bgSat: number,
  bgLightness: number
): { confirm: string; error: string } {
  // Normalize hues to 0-360
  const textH = ((textHue % 360) + 360) % 360;
  const bgH = ((bgHue % 360) + 360) % 360;

  // Only avoid hues that are actually chromatic (have meaningful saturation)
  const avoidHues: number[] = [];
  if (textSat > CHROMATIC_THRESHOLD) avoidHues.push(textH);
  if (bgSat > CHROMATIC_THRESHOLD) avoidHues.push(bgH);

  // Find error hue: as close to RED as possible while safe from chromatic colors
  const errorHue = findClosestSafeHue(RED_HUE, avoidHues);

  // Find confirm hue: as close to GREEN as possible while safe from chromatic colors AND error
  const confirmHue = findClosestSafeHue(GREEN_HUE, [...avoidHues, errorHue]);

  // Calculate lightness that contrasts with background
  // Dark background (< 50%) → bright status colors (60%)
  // Light background (≥ 50%) → darker status colors (45%)
  const statusLightness = bgLightness < 50 ? 60 : 45;

  return {
    confirm: `hsl(${Math.round(confirmHue)}, 100%, ${statusLightness}%)`,
    error: `hsl(${Math.round(errorHue)}, 100%, ${statusLightness}%)`,
  };
}

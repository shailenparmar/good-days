import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * useStableHover - Prevents hover flicker when button content changes size
 *
 * Problem: When button text changes on hover, the button resizes. If it shrinks,
 * the cursor may land outside the new boundary, triggering mouseLeave, which
 * reverts the text, button grows, cursor inside again — infinite flicker.
 * If it grows, the mousemove listener (tracking the old rect) may falsely
 * detect an exit when the cursor moves into the expanded area.
 *
 * Solution: On mouseEnter, capture the entry rect (Frame 1). All exit checks
 * compare the cursor against max(entry rect, current container rect) — the
 * largest zone the button has ever occupied. This handles both directions:
 * shrink (entry rect is larger, prevents premature exit) and grow (current
 * rect is larger, allows cursor to roam the expanded area).
 *
 * On exit, everything resets. The entry hitbox returns to Frame 1's natural size.
 *
 * State machine:
 *   IDLE:    hitbox = natural Frame 1 size
 *            mouseenter → capture Frame 1 rect → HOVERED
 *   HOVERED: hitbox = max(Frame 1 rect, current container rect)
 *            mouseleave/mousemove outside hitbox → clear rects → IDLE
 *            window resize → clear rects → IDLE
 *
 * No overlay div needed. No scroll blocking. Pure coordinate math.
 *
 * Usage:
 * ```tsx
 * const { hovered, containerProps } = useStableHover();
 *
 * <div {...containerProps}>
 *   <FunctionButton>
 *     {hovered ? 'short text' : 'longer text'}
 *   </FunctionButton>
 * </div>
 * ```
 */
export function useStableHover() {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedRect = useRef<DOMRect | null>(null);

  // Check if point is inside rect (with buffer to account for border width)
  const isInsideRect = (x: number, y: number, rect: DOMRect) => {
    const buffer = 3;
    return x >= rect.left - buffer && x <= rect.right + buffer && y >= rect.top - buffer && y <= rect.bottom + buffer;
  };

  // Exit zone: max(entry rect, current container rect).
  // Handles both directions — if button shrank, entry rect is larger;
  // if button grew, current rect is larger. Cursor must exit the larger
  // of the two to trigger unhover.
  const getExitRect = () => {
    if (!lockedRect.current) return null;
    if (!containerRef.current) return lockedRect.current;
    const live = containerRef.current.getBoundingClientRect();
    const f1 = lockedRect.current;
    return new DOMRect(
      Math.min(f1.left, live.left),
      Math.min(f1.top, live.top),
      Math.max(f1.right, live.right) - Math.min(f1.left, live.left),
      Math.max(f1.bottom, live.bottom) - Math.min(f1.top, live.top),
    );
  };

  const onMouseEnter = useCallback(() => {
    if (containerRef.current) {
      // Capture the rect BEFORE any state change causes resizing
      lockedRect.current = containerRef.current.getBoundingClientRect();
    }
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback((e: React.MouseEvent) => {
    // Check if cursor is still inside the exit zone
    // (button may have resized but cursor is still in the safe area)
    const exitRect = getExitRect();
    if (exitRect && isInsideRect(e.clientX, e.clientY, exitRect)) {
      // Stay hovered — global mousemove will handle actual exit
      return;
    }
    lockedRect.current = null;
    setHovered(false);
  }, []);

  // Global mousemove to detect when cursor truly exits the exit zone
  useEffect(() => {
    if (!hovered || !lockedRect.current) return;

    const onMouseMove = (e: MouseEvent) => {
      const exitRect = getExitRect();
      if (!exitRect || !isInsideRect(e.clientX, e.clientY, exitRect)) {
        lockedRect.current = null;
        setHovered(false);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, [hovered]);

  // Window resize invalidates captured rects — clean exit
  useEffect(() => {
    if (!hovered) return;
    const onResize = () => {
      lockedRect.current = null;
      setHovered(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [hovered]);

  const containerProps = {
    ref: containerRef,
    onMouseEnter,
    onMouseLeave,
  };

  return {
    hovered,
    containerProps,
  };
}

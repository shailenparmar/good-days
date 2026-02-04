import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * useStableHover - Prevents hover flicker when button content changes size
 *
 * Problem: When button text changes on hover to something shorter, the button shrinks.
 * If cursor was near an edge that moved, it's now outside, triggering mouseLeave,
 * which reverts the text, button grows, cursor inside again — infinite flicker.
 *
 * Solution: On mouseEnter, capture the bounding rect. On mouseLeave, check if the
 * cursor is still within the captured rect — if so, stay hovered. A global mousemove
 * listener detects when the cursor truly exits the original rect.
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

  // Check if point is inside rect
  const isInsideRect = (x: number, y: number, rect: DOMRect) => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const onMouseEnter = useCallback(() => {
    if (containerRef.current) {
      // Capture the rect BEFORE any state change causes shrinking
      lockedRect.current = containerRef.current.getBoundingClientRect();
    }
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback((e: React.MouseEvent) => {
    // If we have a locked rect, check if cursor is still inside it
    // (button may have shrunk but cursor is still in original area)
    if (lockedRect.current && isInsideRect(e.clientX, e.clientY, lockedRect.current)) {
      // Stay hovered — global mousemove will handle actual exit
      return;
    }
    lockedRect.current = null;
    setHovered(false);
  }, []);

  // Global mousemove to detect when cursor truly exits the locked rect
  useEffect(() => {
    if (!hovered || !lockedRect.current) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!lockedRect.current) return;
      if (!isInsideRect(e.clientX, e.clientY, lockedRect.current)) {
        lockedRect.current = null;
        setHovered(false);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
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

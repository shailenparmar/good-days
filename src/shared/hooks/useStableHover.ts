import { useRef, useState, useCallback } from 'react';

/**
 * useStableHover - Prevents hover flicker when button content changes size
 *
 * Problem: When button text changes on hover to something shorter, the button shrinks.
 * If cursor was near an edge that moved, it's now outside, triggering mouseLeave,
 * which reverts the text, button grows, cursor inside again — infinite flicker.
 *
 * Solution: On mouseEnter, the hover layer switches to position:fixed at the button's
 * exact screen coordinates. This makes it immune to any layout shifts — the button
 * can shrink, move, or reflow, but the hover hitbox stays exactly where it was.
 *
 * Usage:
 * ```tsx
 * const { hovered, containerRef, hoverLayerProps } = useStableHover();
 *
 * <div ref={containerRef} style={{ position: 'relative' }}>
 *   <div {...hoverLayerProps} />
 *   <FunctionButton>
 *     {hovered ? 'short text' : 'longer text'}
 *   </FunctionButton>
 * </div>
 * ```
 */
export function useStableHover() {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);

  const onMouseEnter = useCallback(() => {
    // Lock hover layer to exact SCREEN coordinates before any state change
    if (containerRef.current && hoverRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      hoverRef.current.style.position = 'fixed';
      hoverRef.current.style.top = `${rect.top}px`;
      hoverRef.current.style.left = `${rect.left}px`;
      hoverRef.current.style.right = 'auto';
      hoverRef.current.style.bottom = 'auto';
      hoverRef.current.style.width = `${rect.width}px`;
      hoverRef.current.style.height = `${rect.height}px`;
    }
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    // Reset hover layer to relative positioning
    if (hoverRef.current) {
      hoverRef.current.style.position = 'absolute';
      hoverRef.current.style.top = '0';
      hoverRef.current.style.left = '0';
      hoverRef.current.style.right = '0';
      hoverRef.current.style.bottom = '0';
      hoverRef.current.style.width = '';
      hoverRef.current.style.height = '';
    }
    setHovered(false);
  }, []);

  // Props to spread on the hover layer div
  const hoverLayerProps = {
    ref: hoverRef,
    style: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
    onMouseEnter,
    onMouseLeave,
  };

  return {
    hovered,
    containerRef,
    hoverLayerProps,
  };
}

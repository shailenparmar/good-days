import type { StreamingControls } from '@features/theme/types';

// Module-level ref for streaming controls. Written by WebSyncBridge on
// stream-state messages, read by ColorPicker during render. Bypasses
// ThemeContext to avoid a full cascade of 15+ consumer re-renders on
// every stream-state change (beta join/leave, side switch, etc.).
export const streamingControlsRef: { current: StreamingControls | null } = { current: null };

import { useSyncExternalStore } from 'react';
import type { StreamingControls } from '@features/theme/types';

// Module-level store for streaming controls. Written by WebSyncBridge on
// stream-state messages, subscribed by ColorPicker for indicator sizing.
// Bypasses ThemeContext to avoid a full cascade of 15+ consumer re-renders
// on every stream-state change (beta join/leave, side switch, etc.).
// Only the 4 ColorPicker instances re-render on changes.

const listeners = new Set<() => void>();
let current: StreamingControls | null = null;

export function setStreamingControls(controls: StreamingControls | null) {
  current = controls;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return current;
}

export function useStreamingControls() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

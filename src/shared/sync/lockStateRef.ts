import { useSyncExternalStore } from 'react';

// Module-level store for app lock state. Written by AppContent,
// subscribed by WebSyncBridge. Needed because useAuth() creates
// independent state per call site (no shared context), so the bridge
// can't use useAuth directly to detect lock/unlock.

const listeners = new Set<() => void>();
let locked = false;

export function setAppLocked(value: boolean) {
  if (locked === value) return;
  locked = value;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return locked;
}

export function useAppLocked() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

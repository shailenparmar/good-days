import { useSyncExternalStore } from 'react';

// Module-level store for stream debug stats. Written by useWebSync (WS messages)
// and WebSyncBridge (rAF renders, stream state). Subscribed by StreamDebugOverlay.
// Follows the streamingControlsRef.ts pattern (useSyncExternalStore).

const listeners = new Set<() => void>();

const WS_BUFFER_SIZE = 60;
const RAF_BUFFER_SIZE = 60;

// Rolling timestamp buffers
const wsTimestamps: number[] = [];
const rafTimestamps: number[] = [];

// Coalescing detection
let wsSinceLastRaf = 0;
let coalescedTotal = 0;

// Stream lifecycle
let isActive = false;
let startedAt = 0;
let pausedAt = 0;

export interface StreamDebugSnapshot {
  msgPerSec: number;
  renderFps: number;
  avgLatency: number;
  jitter: number;
  coalesced: number;
  duration: number;
  isActive: boolean;
  pausedAt: number;
}

function notify() {
  listeners.forEach(l => l());
}

export function recordWsMessage(now: number) {
  wsTimestamps.push(now);
  if (wsTimestamps.length > WS_BUFFER_SIZE) wsTimestamps.shift();
  wsSinceLastRaf++;
}

export function recordRafRender() {
  const now = performance.now();
  rafTimestamps.push(now);
  if (rafTimestamps.length > RAF_BUFFER_SIZE) rafTimestamps.shift();
  if (wsSinceLastRaf > 1) {
    coalescedTotal += wsSinceLastRaf - 1;
  }
  wsSinceLastRaf = 0;
}

export function setStreamActive(active: boolean) {
  if (active && !isActive) {
    // Stream start — reset all counters
    wsTimestamps.length = 0;
    rafTimestamps.length = 0;
    wsSinceLastRaf = 0;
    coalescedTotal = 0;
    startedAt = performance.now();
    pausedAt = 0;
  } else if (!active && isActive) {
    // Stream stop — record when it ended
    pausedAt = performance.now();
  }
  isActive = active;
  notify();
}

function computeSnapshot(): StreamDebugSnapshot {
  const now = performance.now();
  const windowMs = 1000;
  const cutoff = now - windowMs;

  // Count messages in last second
  const recentWs = wsTimestamps.filter(t => t >= cutoff);
  const recentRaf = rafTimestamps.filter(t => t >= cutoff);

  // Compute gaps between consecutive WS messages (all in buffer)
  const gaps: number[] = [];
  for (let i = 1; i < wsTimestamps.length; i++) {
    const gap = wsTimestamps[i] - wsTimestamps[i - 1];
    if (wsTimestamps[i] >= cutoff) {
      gaps.push(gap);
    }
  }

  let avgLatency = 0;
  let jitter = 0;
  if (gaps.length > 0) {
    const sum = gaps.reduce((a, b) => a + b, 0);
    avgLatency = sum / gaps.length;
    const variance = gaps.reduce((a, g) => a + (g - avgLatency) ** 2, 0) / gaps.length;
    jitter = Math.sqrt(variance);
  }

  const duration = startedAt > 0 ? (isActive ? now - startedAt : (pausedAt || now) - startedAt) / 1000 : 0;

  return {
    msgPerSec: recentWs.length,
    renderFps: recentRaf.length,
    avgLatency,
    jitter,
    coalesced: coalescedTotal,
    duration,
    isActive,
    pausedAt,
  };
}

let snapshotCache: StreamDebugSnapshot = computeSnapshot();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshotCache;
}

// Called by the overlay's 500ms interval to refresh the cached snapshot
export function refreshSnapshot() {
  snapshotCache = computeSnapshot();
  notify();
}

export function useStreamDebugStats() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

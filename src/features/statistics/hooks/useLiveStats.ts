import { useState, useEffect, useRef, useCallback } from 'react';
import { getItem, setItem } from '@shared/storage';
import type { ColorPayload } from '@shared/sync/protocol';

// --- Distance math ---

/** Shortest arc on the hue circle (0–180°) */
function shortestHuePath(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

/** Euclidean distance in cylindrical HSL space.
 *  x = S·cos(H·π/180), y = S·sin(H·π/180), z = L  */
function hslDistance(
  h1: number, s1: number, l1: number,
  h2: number, s2: number, l2: number,
): number {
  const rad1 = (h1 * Math.PI) / 180;
  const rad2 = (h2 * Math.PI) / 180;
  const dx = s2 * Math.cos(rad2) - s1 * Math.cos(rad1);
  const dy = s2 * Math.sin(rad2) - s1 * Math.sin(rad1);
  const dz = l2 - l1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// --- msg/s tracking (O(1) per message) ---

interface MsgRateState {
  windowStart: number;
  windowCount: number;
  lastRate: number | null;
}

export interface LiveStats {
  hueDistance: number;
  hslDistance: number;
  msgPerSec: number | null;
  phoneSaves: number;
}

export interface LiveStatsActions {
  recordColorUpdate: (colors: ColorPayload) => void;
  recordSave: () => void;
}

export function useLiveStats(isLiveStreaming: boolean): LiveStats & LiveStatsActions {
  // --- React state (flushed from refs every 2s) ---
  const [hueDistance, setHueDistance] = useState(() => {
    const saved = getItem('liveHueDistance');
    return saved ? Number(saved) : 0;
  });
  const [hslDist, setHslDist] = useState(() => {
    const saved = getItem('liveHslDistance');
    return saved ? Number(saved) : 0;
  });
  const [phoneSaves, setPhoneSaves] = useState(() => {
    const saved = getItem('livePhoneSaves');
    return saved ? Number(saved) : 0;
  });
  const [msgPerSec, setMsgPerSec] = useState<number | null>(null);

  // --- Refs (hot path — no React state, no localStorage, no DOM) ---
  const hueDistRef = useRef(hueDistance);
  const hslDistRef = useRef(hslDist);
  const phoneSavesRef = useRef(phoneSaves);
  const msgRateRef = useRef<MsgRateState>({ windowStart: 0, windowCount: 0, lastRate: null });

  // Previous colors for delta calculation. Null = first message of stream (skip).
  const prevColorsRef = useRef<{ hue: number; sat: number; light: number; bgHue: number; bgSat: number; bgLight: number } | null>(null);

  // Track streaming state in a ref for use in the flush interval
  const isStreamingRef = useRef(isLiveStreaming);
  isStreamingRef.current = isLiveStreaming;

  // Reset prevColors when streaming stops — first message of each stream skipped
  useEffect(() => {
    if (!isLiveStreaming) {
      prevColorsRef.current = null;
      // Clear msg/s display immediately
      msgRateRef.current = { windowStart: 0, windowCount: 0, lastRate: null };
      setMsgPerSec(null);
    }
  }, [isLiveStreaming]);

  // --- Hot-path callbacks (only mutate refs) ---
  const recordColorUpdate = useCallback((colors: ColorPayload) => {
    const prev = prevColorsRef.current;
    if (prev) {
      // Hue distance: text + bg wraparound-aware
      hueDistRef.current +=
        shortestHuePath(prev.hue, colors.hue) +
        shortestHuePath(prev.bgHue, colors.bgHue);

      // HSL distance: text + bg cylindrical euclidean
      hslDistRef.current +=
        hslDistance(prev.hue, prev.sat, prev.light, colors.hue, colors.sat, colors.light) +
        hslDistance(prev.bgHue, prev.bgSat, prev.bgLight, colors.bgHue, colors.bgSat, colors.bgLight);
    }
    prevColorsRef.current = { hue: colors.hue, sat: colors.sat, light: colors.light, bgHue: colors.bgHue, bgSat: colors.bgSat, bgLight: colors.bgLight };

    // O(1) msg/s tracking
    const now = Date.now();
    const rate = msgRateRef.current;
    if (now - rate.windowStart >= 1000) {
      // Window completed: store rate, start new window
      if (rate.windowStart > 0) {
        rate.lastRate = rate.windowCount;
      }
      rate.windowStart = now;
      rate.windowCount = 1;
    } else {
      rate.windowCount++;
    }
  }, []);

  const recordSave = useCallback(() => {
    phoneSavesRef.current += 1;
  }, []);

  // --- Flush interval (2s): refs → React state + localStorage ---
  useEffect(() => {
    const flush = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;

      setHueDistance(hueDistRef.current);
      setHslDist(hslDistRef.current);
      setPhoneSaves(phoneSavesRef.current);

      // Only show msg/s when streaming
      if (isStreamingRef.current) {
        setMsgPerSec(msgRateRef.current.lastRate);
      }

      setItem('liveHueDistance', String(hueDistRef.current));
      setItem('liveHslDistance', String(hslDistRef.current));
      setItem('livePhoneSaves', String(phoneSavesRef.current));
    };

    const interval = setInterval(flush, 2000);
    return () => clearInterval(interval);
  }, []);

  // --- beforeunload: flush refs → localStorage ---
  useEffect(() => {
    const handleBeforeUnload = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      setItem('liveHueDistance', String(hueDistRef.current));
      setItem('liveHslDistance', String(hslDistRef.current));
      setItem('livePhoneSaves', String(phoneSavesRef.current));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    hueDistance,
    hslDistance: hslDist,
    msgPerSec,
    phoneSaves,
    recordColorUpdate,
    recordSave,
  };
}

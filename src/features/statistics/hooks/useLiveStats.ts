import { useState, useEffect, useRef } from 'react';
import { getItem, setItem } from '@shared/storage';

/** Shortest arc on the hue circle (0–180°) */
function shortestHuePath(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

/** Euclidean distance in cylindrical HSL space */
function hslDist(
  h1: number, s1: number, l1: number,
  h2: number, s2: number, l2: number,
): number {
  const r1 = (h1 * Math.PI) / 180;
  const r2 = (h2 * Math.PI) / 180;
  const dx = s2 * Math.cos(r2) - s1 * Math.cos(r1);
  const dy = s2 * Math.sin(r2) - s1 * Math.sin(r1);
  const dz = l2 - l1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export interface LiveStats {
  hueDistance: number;
  hslDistance: number;
  updateHz: number | null;
  liveSaves: number;
}

/** Sliding window duration for hz calculation */
const HZ_WINDOW_MS = 2000;

interface ThemeColors {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
}

export function useLiveStats(
  isLiveStreaming: boolean,
  phoneSaveCount: number,
  colors: ThemeColors,
  colorUpdateCountRef: React.RefObject<number>,
): LiveStats {
  // --- Persisted base values (loaded once from localStorage) ---
  const baseLiveSaves = useRef(Number(getItem('liveLiveSaves')) || 0);

  const [display, setDisplay] = useState<LiveStats>(() => ({
    hueDistance: Number(getItem('liveHueDistance')) || 0,
    hslDistance: Number(getItem('liveHslDistance')) || 0,
    updateHz: null,
    liveSaves: baseLiveSaves.current,
  }));

  // --- Refs (mutated in render path — zero allocations) ---
  const hueDistRef = useRef(display.hueDistance);
  const hslDistRef = useRef(display.hslDistance);
  const prevColorsRef = useRef<ThemeColors | null>(null);
  // Ring buffer of message timestamps for hz calculation
  const msgTimestampsRef = useRef<number[]>([]);
  // Last seen colorUpdateCount — used in rAF to detect new WS messages
  const lastUpdateCountRef = useRef(colorUpdateCountRef.current);

  // Total live saves = persisted base + session phone saves
  const totalLiveSaves = baseLiveSaves.current + phoneSaveCount;

  // --- Compute deltas in render path (ref-only, no state) ---
  // Track travel from ANY color change (phone streaming OR desktop dragging)
  {
    const prev = prevColorsRef.current;
    if (prev && (
      prev.hue !== colors.hue || prev.sat !== colors.sat || prev.light !== colors.light ||
      prev.bgHue !== colors.bgHue || prev.bgSat !== colors.bgSat || prev.bgLight !== colors.bgLight
    )) {
      hueDistRef.current +=
        shortestHuePath(prev.hue, colors.hue) +
        shortestHuePath(prev.bgHue, colors.bgHue);
      hslDistRef.current +=
        hslDist(prev.hue, prev.sat, prev.light, colors.hue, colors.sat, colors.light) +
        hslDist(prev.bgHue, prev.bgSat, prev.bgLight, colors.bgHue, colors.bgSat, colors.bgLight);
    }
    prevColorsRef.current = colors;
  }

  // --- rAF loop: track timestamps at full rate, throttle React updates ---
  useEffect(() => {
    if (!isLiveStreaming) {
      // Clear hz and buffer when not streaming
      msgTimestampsRef.current.length = 0;
      lastUpdateCountRef.current = colorUpdateCountRef.current;
      setDisplay(d => ({ ...d, updateHz: null }));
      return;
    }
    let raf = 0;
    let lastDisplayUpdate = 0;
    const DISPLAY_INTERVAL = 200; // Update React state at ~5fps (not 60fps)
    const tick = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;

      // Push timestamps for new WS messages since last tick
      const currentCount = colorUpdateCountRef.current;
      const newMessages = currentCount - lastUpdateCountRef.current;
      if (newMessages > 0) {
        const now = performance.now();
        for (let i = 0; i < newMessages; i++) {
          msgTimestampsRef.current.push(now);
        }
        lastUpdateCountRef.current = currentCount;
      }

      const now = performance.now();
      // Prune entries older than window
      const buf = msgTimestampsRef.current;
      while (buf.length > 0 && buf[0] < now - HZ_WINDOW_MS) {
        buf.shift();
      }

      // Only update React state at throttled rate to avoid 60fps App re-renders
      if (now - lastDisplayUpdate >= DISPLAY_INTERVAL) {
        lastDisplayUpdate = now;
        let hz: number | null = null;
        if (buf.length >= 2) {
          const spanSec = Math.max(now - buf[0], 1) / 1000;
          hz = buf.length / spanSec;
        }
        setDisplay({
          hueDistance: hueDistRef.current,
          hslDistance: hslDistRef.current,
          updateHz: hz,
          liveSaves: totalLiveSaves,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isLiveStreaming, totalLiveSaves, colorUpdateCountRef]);

  // Sync travel + liveSaves when not streaming (rAF not running)
  useEffect(() => {
    if (!isLiveStreaming) {
      setDisplay(d => {
        const hue = hueDistRef.current;
        const hsl = hslDistRef.current;
        if (d.hueDistance === hue && d.hslDistance === hsl && d.liveSaves === totalLiveSaves) return d;
        return { ...d, hueDistance: hue, hslDistance: hsl, liveSaves: totalLiveSaves };
      });
    }
  });

  // --- localStorage persist (2s interval) ---
  useEffect(() => {
    const persist = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      setItem('liveHueDistance', String(hueDistRef.current));
      setItem('liveHslDistance', String(hslDistRef.current));
      setItem('liveLiveSaves', String(totalLiveSaves));
    };
    const id = setInterval(persist, 2000);
    return () => clearInterval(id);
  }, [totalLiveSaves]);

  // --- beforeunload: flush to localStorage ---
  useEffect(() => {
    const handle = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      setItem('liveHueDistance', String(hueDistRef.current));
      setItem('liveHslDistance', String(hslDistRef.current));
      setItem('liveLiveSaves', String(totalLiveSaves));
    };
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, [totalLiveSaves]);

  return display;
}

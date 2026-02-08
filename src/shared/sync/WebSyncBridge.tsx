import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { useWebSync } from './useWebSync';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { ColorPayload } from './protocol';

export function WebSyncBridge() {
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const prevLiveRef = useRef<ColorPayload | null>(null);
  const skipBridgeRef = useRef(false);

  // rAF-throttled color application: buffers the latest colors from WS
  // and applies them once per animation frame, coalescing multiple messages.
  const pendingColorsRef = useRef<ColorPayload | null>(null);
  const rafIdRef = useRef(0);

  const currentColorway: ColorPayload = {
    hue: theme.hue,
    sat: theme.saturation,
    light: theme.lightness,
    bgHue: theme.bgHue,
    bgSat: theme.bgSaturation,
    bgLight: theme.bgLightness,
  };

  // Callback from WebSocket — fires on every ws.onmessage.
  // Only increments the hz counter and buffers colors. Actual React
  // state updates are deferred to the next animation frame so multiple
  // WS messages within one frame coalesce into a single render.
  const handleColorUpdate = useCallback((colors: ColorPayload) => {
    themeRef.current.colorUpdateCountRef.current++;
    pendingColorsRef.current = colors;
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        const c = pendingColorsRef.current;
        if (!c) return;
        const t = themeRef.current;
        skipBridgeRef.current = true;
        t.setLivePreset({
          hue: c.hue, sat: c.sat, light: c.light,
          bgHue: c.bgHue, bgSat: c.bgSat, bgLight: c.bgLight,
        });
        // Skip applyPreset while desktop user is dragging a color picker —
        // otherwise phone's updates fight the local drag, causing flicker.
        // livePreset still tracks the phone's colors so they resume on drag end.
        if (t.localDragRef.current) return;
        t.applyPreset({
          hue: c.hue, sat: c.sat, light: c.light,
          bgHue: c.bgHue, bgSat: c.bgSat, bgLight: c.bgLight,
        });
      });
    }
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, []);

  const syncState = useWebSync(currentColorway, { onColorUpdate: handleColorUpdate });

  // Bridge sync state into ThemeContext (skipped for color-update — handled by callback)
  useEffect(() => {
    if (skipBridgeRef.current) {
      skipBridgeRef.current = false;
      return;
    }
    theme.setLivePreset(syncState.livePreset ? {
      hue: syncState.livePreset.hue,
      sat: syncState.livePreset.sat,
      light: syncState.livePreset.light,
      bgHue: syncState.livePreset.bgHue,
      bgSat: syncState.livePreset.bgSat,
      bgLight: syncState.livePreset.bgLight,
    } : null);
  }, [syncState.livePreset]);

  // Auto-select [live] on new pairing (null → value transition)
  useEffect(() => {
    const wasNull = prevLiveRef.current === null;
    prevLiveRef.current = syncState.livePreset;

    if (wasNull && syncState.livePreset) {
      markEasterEggFound('liveControl');
      const liveIndex = theme.presets.length + theme.customPresets.length;
      theme.setIsLiveActive(true);
      theme.setSelectedPreset(null);
      theme.setSelectedCustomPreset(null);
      theme.setActivePresetIndex(liveIndex);
      theme.applyPreset({
        hue: syncState.livePreset.hue,
        sat: syncState.livePreset.sat,
        light: syncState.livePreset.light,
        bgHue: syncState.livePreset.bgHue,
        bgSat: syncState.livePreset.bgSat,
        bgLight: syncState.livePreset.bgLight,
      });
    }
  }, [syncState.livePreset]);

  // Bridge streaming state into ThemeContext
  useEffect(() => {
    theme.setIsLiveStreaming(syncState.isStreaming);
  }, [syncState.isStreaming]);

  // Bridge streamingControls to ThemeContext
  useEffect(() => {
    theme.setStreamingControls(syncState.streamingControls);
  }, [syncState.streamingControls]);

  // Clear isLiveActive when livePreset goes null
  useEffect(() => {
    if (!syncState.livePreset) {
      theme.setIsLiveActive(false);
      theme.setIsLiveStreaming(false);
      theme.setStreamingControls(null);
    }
  }, [syncState.livePreset]);

  // Handle save-preset from phone
  const prevSaveRef = useRef(0);
  useEffect(() => {
    if (syncState.saveRequested > prevSaveRef.current) {
      const delta = syncState.saveRequested - prevSaveRef.current;
      prevSaveRef.current = syncState.saveRequested;
      theme.saveCustomPreset();
      for (let i = 0; i < delta; i++) theme.incrementPhoneSaveCount();
    }
  }, [syncState.saveRequested]);

  return null;
}

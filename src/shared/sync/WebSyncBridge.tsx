import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { useWebSync } from './useWebSync';
import type { ColorPayload } from './protocol';

export function WebSyncBridge() {
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const prevLiveRef = useRef<ColorPayload | null>(null);
  const skipBridgeRef = useRef(false);

  const currentColorway: ColorPayload = {
    hue: theme.hue,
    sat: theme.saturation,
    light: theme.lightness,
    bgHue: theme.bgHue,
    bgSat: theme.bgSaturation,
    bgLight: theme.bgLightness,
  };

  // Direct callback from WebSocket — fires synchronously in ws.onmessage.
  // React 18 batches all setState calls from this + useWebSync into ONE render.
  const handleColorUpdate = useCallback((colors: ColorPayload) => {
    const t = themeRef.current;
    skipBridgeRef.current = true;
    t.setLivePreset({
      hue: colors.hue,
      sat: colors.sat,
      light: colors.light,
      bgHue: colors.bgHue,
      bgSat: colors.bgSat,
      bgLight: colors.bgLight,
    });
    if (t.isLiveActive) {
      t.applyPreset({
        hue: colors.hue,
        sat: colors.sat,
        light: colors.light,
        bgHue: colors.bgHue,
        bgSat: colors.bgSat,
        bgLight: colors.bgLight,
      });
    }
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
      prevSaveRef.current = syncState.saveRequested;
      theme.saveCustomPreset();
    }
  }, [syncState.saveRequested]);

  return null;
}

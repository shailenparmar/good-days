import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { useWebSync } from './useWebSync';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import type { ColorPayload } from './protocol';

interface WebSyncBridgeProps {
  onLiveColorUpdate?: (colors: ColorPayload) => void;
  onLiveSavePreset?: () => void;
}

export function WebSyncBridge({ onLiveColorUpdate, onLiveSavePreset }: WebSyncBridgeProps = {}) {
  const theme = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const prevLiveRef = useRef<ColorPayload | null>(null);
  const skipBridgeRef = useRef(false);
  const onLiveColorUpdateRef = useRef(onLiveColorUpdate);
  onLiveColorUpdateRef.current = onLiveColorUpdate;
  const onLiveSavePresetRef = useRef(onLiveSavePreset);
  onLiveSavePresetRef.current = onLiveSavePreset;

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
    onLiveColorUpdateRef.current?.(colors);
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
    // Skip applyPreset while desktop user is dragging a color picker —
    // otherwise phone's 60fps updates fight the local drag, causing flicker.
    // livePreset still tracks the phone's colors so they resume on drag end.
    if (t.localDragRef.current) return;
    // Always apply — if we're receiving color-update from the relay,
    // we're paired and should render the phone's colors immediately.
    // Don't gate on isLiveActive: the pairing effect sets it via an
    // effect (async), but color-update can arrive before that fires.
    t.applyPreset({
      hue: colors.hue,
      sat: colors.sat,
      light: colors.light,
      bgHue: colors.bgHue,
      bgSat: colors.bgSat,
      bgLight: colors.bgLight,
    });
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
      prevSaveRef.current = syncState.saveRequested;
      theme.saveCustomPreset();
      onLiveSavePresetRef.current?.();
    }
  }, [syncState.saveRequested]);

  return null;
}

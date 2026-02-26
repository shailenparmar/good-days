import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@features/theme';
import { useWebSync } from './useWebSync';
import { markEasterEggFound } from '@shared/utils/easterEggs';
import { setStreamingControls } from './streamingControlsRef';
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
  // Buffers latest colors in a ref; actual React state updates are
  // deferred to the next animation frame so multiple WS messages
  // within one frame coalesce into a single render.
  const handleColorUpdate = useCallback((colors: ColorPayload) => {
    pendingColorsRef.current = colors;
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        const c = pendingColorsRef.current;
        if (!c) return;
        const t = themeRef.current;

        // Skip all updates during local desktop drag — just buffer in pendingColorsRef.
        // setLivePreset was called here before but triggered a React re-render every
        // rAF frame on top of the drag's own state updates, causing lag. The phone's
        // latest colors are always in pendingColorsRef and sync on stream-stop.
        if (t.localDragRef.current) {
          skipBridgeRef.current = true;
        } else {
          // CSS-only streaming: set CSS vars directly, skip ALL React state.
          // This eliminates the re-render cascade (30-50+ useTheme consumers
          // × 48fps) that caused "works for half second then frozen."
          // React state syncs on stream-stop and disconnect.
          const el = document.documentElement;
          el.style.setProperty('--h', String(c.hue));
          el.style.setProperty('--s', c.sat + '%');
          el.style.setProperty('--l', c.light + '%');
          el.style.setProperty('--bh', String(c.bgHue));
          el.style.setProperty('--bs', c.bgSat + '%');
          el.style.setProperty('--bl', c.bgLight + '%');
          // Indicator position vars for ColorPicker
          el.style.setProperty('--th-p', String(((360 - c.hue) / 360) * 100));
          el.style.setProperty('--ts-p', String(c.sat));
          el.style.setProperty('--tl-p', String(100 - c.light));
          el.style.setProperty('--bh-p', String(((360 - c.bgHue) / 360) * 100));
          el.style.setProperty('--bs-p', String(c.bgSat));
          el.style.setProperty('--bl-p', String(100 - c.bgLight));
        }
      });
    }
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, []);

  const { sendSettingsState, ...syncState } = useWebSync(currentColorway, { onColorUpdate: handleColorUpdate });

  // Track desktop settings state and forward to phone for adaptive framerate.
  // Phone streams at 60fps when settings is closed, 24fps when open.
  const settingsOpenRef = useRef(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const open = (e as CustomEvent).detail.open as boolean;
      settingsOpenRef.current = open;
      sendSettingsState(open);
    };
    window.addEventListener('settingschange', handler);
    return () => window.removeEventListener('settingschange', handler);
  }, [sendSettingsState]);

  // Bridge sync state into ThemeContext (skipped for color-update — handled by callback)
  useEffect(() => {
    if (skipBridgeRef.current) {
      skipBridgeRef.current = false;
      // Only skip non-null transitions (color updates during streaming).
      // Never skip null (disconnect) — skipBridgeRef stays true during streaming
      // because the rAF callback sets it every frame but this effect doesn't fire
      // (syncState.livePreset doesn't change during streaming). Without this guard,
      // disconnect would be swallowed and live mode wouldn't drop.
      if (syncState.livePreset) return;
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
      sendSettingsState(settingsOpenRef.current);
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

  // Bridge streaming state into ThemeContext.
  // Auto-switch selection to [live] when streaming starts, so the live
  // button pulses while the phone is actively sending colors.
  // On stream stop, push undo snapshot so each finger-lift is undoable.
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = syncState.isStreaming;
    theme.setIsLiveStreaming(syncState.isStreaming);

    // Auto-select live on stream start (false → true) when paired
    if (!wasStreaming && syncState.isStreaming && syncState.livePreset) {
      // Snapshot colors before phone takes over (for undo on stream stop)
      theme.prePickerSnapshotRef.current = {
        hue: theme.hue, sat: theme.saturation, light: theme.lightness,
        bgHue: theme.bgHue, bgSat: theme.bgSaturation, bgLight: theme.bgLightness,
      };
      const liveIndex = theme.presets.length + theme.customPresets.length;
      theme.setIsLiveActive(true);
      theme.setSelectedPreset(null);
      theme.setSelectedCustomPreset(null);
      theme.setActivePresetIndex(liveIndex);
    }

    // Stream stop (true → false): sync final CSS-only colors to React state,
    // then push undo entry for the completed drag.
    // setActivePresetIndex is set HERE (same batch) so PresetGrid's
    // colorPickerDragCount effect sees the value already set and React
    // bails out on the duplicate setState — eliminating a second full
    // cascade render of all 15+ useTheme() consumers.
    if (wasStreaming && !syncState.isStreaming) {
      const finalColors = pendingColorsRef.current;
      if (finalColors) {
        skipBridgeRef.current = true;
        theme.applyLivePreset({
          hue: finalColors.hue, sat: finalColors.sat, light: finalColors.light,
          bgHue: finalColors.bgHue, bgSat: finalColors.bgSat, bgLight: finalColors.bgLight,
        });
        pendingColorsRef.current = null;
      }
      const liveSlotCount = theme.livePreset ? 1 : 0;
      const saveIndex = theme.presets.length + theme.customPresets.length + liveSlotCount + 1;
      theme.setActivePresetIndex(saveIndex);
      theme.incrementColorPickerDragCount();
    }
  }, [syncState.isStreaming]);

  // Write streamingControls to module-level store (not ThemeContext).
  // Only ColorPicker subscribes via useStreamingControls(). Using a
  // dedicated store avoids a full cascade of 15+ consumer re-renders
  // on every stream-state message (beta join/leave, side switch).
  useEffect(() => {
    setStreamingControls(syncState.streamingControls);
  }, [syncState.streamingControls]);

  // Clear isLiveActive when livePreset goes null (disconnect).
  // Sync final colors from CSS-only streaming to React state so
  // localStorage saves and ColorPicker indicators are correct.
  // Uses individual setters (not applyLivePreset) to avoid setting
  // livePreset back to non-null after bridge already set it null.
  useEffect(() => {
    if (!syncState.livePreset) {
      const finalColors = pendingColorsRef.current;
      if (finalColors) {
        theme.setHue(finalColors.hue);
        theme.setSaturation(finalColors.sat);
        theme.setLightness(finalColors.light);
        theme.setBgHue(finalColors.bgHue);
        theme.setBgSaturation(finalColors.bgSat);
        theme.setBgLightness(finalColors.bgLight);
      }
      pendingColorsRef.current = null;
      theme.setIsLiveActive(false);
      theme.setIsLiveStreaming(false);
      setStreamingControls(null);
    }
  }, [syncState.livePreset]);

  // Handle save-preset from phone — highlight the newly saved preset.
  const prevSaveRef = useRef(0);
  useEffect(() => {
    if (syncState.saveRequested > prevSaveRef.current) {
      prevSaveRef.current = syncState.saveRequested;
      const newPresetIndex = theme.presets.length + theme.customPresets.length;
      theme.saveCustomPreset(syncState.saveColors ?? undefined);
      theme.setActivePresetIndex(newPresetIndex);
    }
  }, [syncState.saveRequested]);

  // Bridge pairing code to ThemeContext
  useEffect(() => {
    theme.setPairingCode(syncState.pairingCode);
  }, [syncState.pairingCode]);

  return null;
}

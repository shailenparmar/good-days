import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@features/theme';
import { useWebSync } from './useWebSync';
import type { ColorPayload } from './protocol';

export function WebSyncBridge() {
  const theme = useTheme();
  const prevLiveRef = useRef<ColorPayload | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>(['init']);

  const log = (msg: string) => {
    console.log('[WebSyncBridge]', msg);
    setDebugLog(prev => [...prev.slice(-8), msg]);
  };

  const currentColorway: ColorPayload = {
    hue: theme.hue,
    sat: theme.saturation,
    light: theme.lightness,
    bgHue: theme.bgHue,
    bgSat: theme.bgSaturation,
    bgLight: theme.bgLightness,
  };

  const syncState = useWebSync(currentColorway);

  // Log state changes
  useEffect(() => {
    log(`sync: live=${syncState.livePreset ? 'yes' : 'null'} streaming=${syncState.isStreaming} side=${syncState.streamSide}`);
  }, [syncState.livePreset, syncState.isStreaming, syncState.streamSide]);

  // Bridge sync state into ThemeContext
  useEffect(() => {
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
      log('NEW PAIRING — auto-selecting [live]');
      theme.setIsLiveActive(true);
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

  // When live is active and preset changes, apply it
  useEffect(() => {
    if (theme.isLiveActive && syncState.livePreset) {
      theme.applyPreset({
        hue: syncState.livePreset.hue,
        sat: syncState.livePreset.sat,
        light: syncState.livePreset.light,
        bgHue: syncState.livePreset.bgHue,
        bgSat: syncState.livePreset.bgSat,
        bgLight: syncState.livePreset.bgLight,
      });
    }
  }, [syncState.livePreset, theme.isLiveActive]);

  // Clear isLiveActive when livePreset goes null
  useEffect(() => {
    if (!syncState.livePreset) {
      theme.setIsLiveActive(false);
    }
  }, [syncState.livePreset]);

  // Debug overlay
  return (
    <div style={{
      position: 'fixed',
      bottom: 8,
      right: 8,
      zIndex: 99999,
      background: 'rgba(0,0,0,0.85)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '10px',
      padding: '6px 8px',
      borderRadius: '4px',
      maxWidth: '260px',
      pointerEvents: 'none',
      lineHeight: 1.4,
    }}>
      {debugLog.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

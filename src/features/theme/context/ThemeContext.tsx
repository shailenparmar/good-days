import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { getItem, setItem, removeItem } from '@shared/storage';
import type { ColorPreset, ThemeState, ThemeActions, PresetState, PresetActions, ColorwayTracking, LiveSyncState, LiveSyncActions } from '../types';

export const DEFAULT_PRESETS: ColorPreset[] = [
  { hue: 63, sat: 100, light: 12, bgHue: 52, bgSat: 100, bgLight: 91 },
  { hue: 229, sat: 61, light: 100, bgHue: 251, bgSat: 100, bgLight: 59 },
  { hue: 244, sat: 58, light: 0, bgHue: 0, bgSat: 100, bgLight: 63 },
  { hue: 34, sat: 65, light: 43, bgHue: 168, bgSat: 82, bgLight: 8 },
  { hue: 116, sat: 77, light: 46, bgHue: 213, bgSat: 90, bgLight: 17 },
];

interface ThemeContextValue extends ThemeState, ThemeActions, PresetState, PresetActions, ColorwayTracking, LiveSyncState, LiveSyncActions {}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Text color state (defaults to preset 1)
  const [hue, setHue] = useState(() => {
    const saved = getItem('colorHue');
    return saved ? Number(saved) : DEFAULT_PRESETS[0].hue;
  });
  const [saturation, setSaturation] = useState(() => {
    const saved = getItem('colorSaturation');
    return saved ? Number(saved) : DEFAULT_PRESETS[0].sat;
  });
  const [lightness, setLightness] = useState(() => {
    const saved = getItem('colorLightness');
    return saved ? Number(saved) : DEFAULT_PRESETS[0].light;
  });

  // Background color state (defaults to preset 1)
  const [bgHue, setBgHue] = useState(() => {
    const saved = getItem('bgHue');
    return saved ? Number(saved) : DEFAULT_PRESETS[0].bgHue;
  });
  const [bgSaturation, setBgSaturation] = useState(() => {
    const saved = getItem('bgSaturation');
    return saved ? Number(saved) : DEFAULT_PRESETS[0].bgSat;
  });
  const [bgLightness, setBgLightness] = useState(() => {
    const saved = getItem('bgLightness');
    return saved ? Number(saved) : DEFAULT_PRESETS[0].bgLight;
  });

  // Preset state - persist exactly as saved (including deletions)
  const [presets, setPresets] = useState<ColorPreset[]>(() => {
    const savedPresets = getItem('colorPresets');
    if (savedPresets) {
      return JSON.parse(savedPresets);
    }
    return DEFAULT_PRESETS;
  });

  const [customPresets, setCustomPresets] = useState<ColorPreset[]>(() => {
    const savedCustom = getItem('customColorPresets');
    return savedCustom ? JSON.parse(savedCustom) : [];
  });

  const [selectedPreset, setSelectedPreset] = useState<number | null>(() => {
    const saved = getItem('selectedPreset');
    return saved ? Number(saved) : null;
  });

  const [selectedCustomPreset, setSelectedCustomPreset] = useState<number | null>(() => {
    const saved = getItem('selectedCustomPreset');
    return saved ? Number(saved) : null;
  });

  const [activePresetIndex, setActivePresetIndex] = useState<number | null>(null);

  const [randomPreview, setRandomPreview] = useState<ColorPreset>({
    hue: 0, sat: 50, light: 50, bgHue: 0, bgSat: 0, bgLight: 10
  });

  // Colorway tracking - start with preset 1 already counted
  const [uniqueColorways, setUniqueColorways] = useState(() => {
    const saved = getItem('uniqueColorways');
    return saved ? Number(saved) : 1;
  });

  const [seenColorways, setSeenColorways] = useState<Set<string>>(() => {
    const saved = getItem('seenColorways');
    if (saved) return new Set(JSON.parse(saved));
    // Initialize with preset 1's colorway
    const preset1 = DEFAULT_PRESETS[0];
    const preset1Key = `${preset1.hue}-${preset1.sat}-${preset1.light}-${preset1.bgHue}-${preset1.bgSat}-${preset1.bgLight}`;
    return new Set([preset1Key]);
  });

  // Live sync state
  const [livePreset, setLivePreset] = useState<ColorPreset | null>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  // Desktop drag override: when true, incoming color-updates skip applyPreset
  const localDragRef = useRef(false);
  const setLocalDragging = (dragging: boolean) => { localDragRef.current = dragging; };

  // Picker drag signaling: ColorPicker increments count on drag start,
  // PresetGrid watches it to pulse save button and push undo entries
  const [colorPickerDragCount, setColorPickerDragCount] = useState(0);
  const incrementColorPickerDragCount = useCallback(() => setColorPickerDragCount(c => c + 1), []);
  const prePickerSnapshotRef = useRef<ColorPreset | null>(null);

  const saveLivePreset = () => {
    if (!livePreset) return;
    setCustomPresets(prev => [...prev, { ...livePreset }]);
    setSelectedPreset(null);
    setSelectedCustomPreset(null);
  };

  // Combined setLivePreset + applyPreset for streaming hot path.
  // All 7 state setters fire in one synchronous call → React batches into 1 render.
  const applyLivePreset = (preset: ColorPreset) => {
    setLivePreset(preset);
    setHue(preset.hue);
    setSaturation(preset.sat);
    setLightness(preset.light);
    setBgHue(preset.bgHue);
    setBgSaturation(preset.bgSat);
    setBgLightness(preset.bgLight);
  };

  const colorwayOnSettingsOpen = useRef<string>('');
  const hasLoadedFromStorage = useRef(false);

  // Re-read values from storage after mount (handles race conditions)
  useEffect(() => {
    if (hasLoadedFromStorage.current) return;
    hasLoadedFromStorage.current = true;

    // Re-check storage values after mount
    const savedHue = getItem('colorHue');
    const savedSat = getItem('colorSaturation');
    const savedLight = getItem('colorLightness');
    const savedBgHue = getItem('bgHue');
    const savedBgSat = getItem('bgSaturation');
    const savedBgLight = getItem('bgLightness');

    if (savedHue !== null) setHue(Number(savedHue));
    if (savedSat !== null) setSaturation(Number(savedSat));
    if (savedLight !== null) setLightness(Number(savedLight));
    if (savedBgHue !== null) setBgHue(Number(savedBgHue));
    if (savedBgSat !== null) setBgSaturation(Number(savedBgSat));
    if (savedBgLight !== null) setBgLightness(Number(savedBgLight));
  }, []);

  // Save color settings — skip during streaming for performance.
  // At 60fps streaming, 6 XOR-encrypted localStorage writes per frame (~2ms)
  // push the frame budget over 16.67ms. When streaming stops, isLiveStreaming
  // flips false → this dep changes → effect fires → saves final colors.
  useEffect(() => {
    if (isLiveStreaming) return;
    setItem('colorHue', String(hue));
    setItem('colorSaturation', String(saturation));
    setItem('colorLightness', String(lightness));
    setItem('bgHue', String(bgHue));
    setItem('bgSaturation', String(bgSaturation));
    setItem('bgLightness', String(bgLightness));
  }, [hue, saturation, lightness, bgHue, bgSaturation, bgLightness, isLiveStreaming]);

  // Sync CSS custom properties so all components using var(--h) etc. update
  useEffect(() => {
    const el = document.documentElement;
    el.style.setProperty('--h', String(hue));
    el.style.setProperty('--s', saturation + '%');
    el.style.setProperty('--l', lightness + '%');
    el.style.setProperty('--bh', String(bgHue));
    el.style.setProperty('--bs', bgSaturation + '%');
    el.style.setProperty('--bl', bgLightness + '%');
    // Indicator position vars for ColorPicker (unitless 0-100, used as percentages)
    el.style.setProperty('--th-p', String(((360 - hue) / 360) * 100));
    el.style.setProperty('--ts-p', String(saturation));
    el.style.setProperty('--tl-p', String(100 - lightness));
    el.style.setProperty('--bh-p', String(((360 - bgHue) / 360) * 100));
    el.style.setProperty('--bs-p', String(bgSaturation));
    el.style.setProperty('--bl-p', String(100 - bgLightness));
  }, [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]);

  // Update Safari toolbar color + page background when background changes.
  // During live mode, set to pure black (the flex container's inline style handles
  // visual bg). When live mode ends (phone disconnects), restore to the computed color.
  useEffect(() => {
    if (isLiveActive) {
      const meta = document.getElementById('theme-color-meta');
      if (meta) meta.setAttribute('content', '#000000');
      document.documentElement.style.backgroundColor = '#000000';
      document.body.style.backgroundColor = '#000000';
      return;
    }
    // Convert to hex — Safari handles hex more reliably than HSL for theme-color
    const s = bgSaturation / 100, l = bgLightness / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + bgHue / 30) % 12;
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    const hex = `#${f(0)}${f(8)}${f(4)}`;
    // macOS Safari: toolbar color is sampled from rendered page background, not theme-color meta.
    // Meta tag only matters on page load. We set it anyway for iOS Safari and other browsers.
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', hex);
    // Safari also uses the page background for toolbar tinting
    document.documentElement.style.backgroundColor = hex;
    document.body.style.backgroundColor = hex;
  }, [bgHue, bgSaturation, bgLightness, isLiveActive]);

  // Save presets
  useEffect(() => {
    setItem('colorPresets', JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    setItem('customColorPresets', JSON.stringify(customPresets));
  }, [customPresets]);

  // Save selected preset
  useEffect(() => {
    if (selectedPreset !== null) {
      setItem('selectedPreset', String(selectedPreset));
      removeItem('selectedCustomPreset');
    }
  }, [selectedPreset]);

  useEffect(() => {
    if (selectedCustomPreset !== null) {
      setItem('selectedCustomPreset', String(selectedCustomPreset));
      removeItem('selectedPreset');
    }
  }, [selectedCustomPreset]);

  // Save colorway tracking
  useEffect(() => {
    setItem('uniqueColorways', String(uniqueColorways));
  }, [uniqueColorways]);

  useEffect(() => {
    setItem('seenColorways', JSON.stringify([...seenColorways]));
  }, [seenColorways]);

  // Helper functions — return CSS variable strings so React sees static values
  const getColor = (lightnessOffset: number = 0) => {
    if (lightnessOffset === 0) return 'hsl(var(--h), var(--s), var(--l))';
    if (lightnessOffset > 0) {
      return `hsl(var(--h), var(--s), min(100%, calc(var(--l) + ${lightnessOffset}%)))`;
    }
    return `hsl(var(--h), var(--s), max(0%, calc(var(--l) + ${lightnessOffset}%)))`;
  };

  const getBgColor = () => {
    return 'hsl(var(--bh), var(--bs), var(--bl))';
  };

  const getColorwayKey = (h: number, s: number, l: number, bh: number, bs: number, bl: number) => {
    return `${h}-${s}-${l}-${bh}-${bs}-${bl}`;
  };

  const trackColorway = (colorway: string) => {
    if (!seenColorways.has(colorway)) {
      setSeenColorways(prev => new Set([...prev, colorway]));
      setUniqueColorways(prev => prev + 1);
    }
  };

  const applyPreset = (preset: ColorPreset) => {
    setHue(preset.hue);
    setSaturation(preset.sat);
    setLightness(preset.light);
    setBgHue(preset.bgHue);
    setBgSaturation(preset.bgSat);
    setBgLightness(preset.bgLight);

    // Track colorway for preset clicks, but NOT during live streaming —
    // phone sends color-update at 60fps which would inflate the count.
    // Live colorways are tracked on save instead (saveCustomPreset).
    if (!isLiveStreaming) {
      const colorway = getColorwayKey(preset.hue, preset.sat, preset.light, preset.bgHue, preset.bgSat, preset.bgLight);
      trackColorway(colorway);
    }
  };

  const savePreset = (index: number, preset: ColorPreset) => {
    const newPresets = [...presets];
    newPresets[index] = preset;
    setPresets(newPresets);
  };

  const saveCustomPreset = (colors?: ColorPreset) => {
    const newPreset: ColorPreset = colors ?? {
      hue,
      sat: saturation,
      light: lightness,
      bgHue,
      bgSat: bgSaturation,
      bgLight: bgLightness,
    };
    setCustomPresets([...customPresets, newPreset]);
    setSelectedPreset(null);
    setSelectedCustomPreset(null);

    // Track colorway on save (covers live mode where applyPreset skips tracking)
    const colorway = getColorwayKey(newPreset.hue, newPreset.sat, newPreset.light, newPreset.bgHue, newPreset.bgSat, newPreset.bgLight);
    trackColorway(colorway);
  };

  const deleteCustomPreset = (index: number) => {
    const newCustomPresets = customPresets.filter((_, i) => i !== index);
    setCustomPresets(newCustomPresets);

    if (newCustomPresets.length > 0) {
      const newIndex = Math.min(index, newCustomPresets.length - 1);
      const nextPreset = newCustomPresets[newIndex];
      applyPreset(nextPreset);
      setSelectedCustomPreset(newIndex);
      setSelectedPreset(null);
    } else {
      setSelectedCustomPreset(null);
    }
  };

  // Track current colorway (call when settings closes for slider changes)
  const trackCurrentColorway = () => {
    const colorway = getColorwayKey(hue, saturation, lightness, bgHue, bgSaturation, bgLightness);
    trackColorway(colorway);
  };

  const randomizeTheme = () => {
    // Haptic feedback on supported devices
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    const newHue = Math.floor(Math.random() * 360);
    const newSat = Math.floor(Math.random() * 101);
    const newLight = Math.floor(Math.random() * 101);
    const newBgHue = Math.floor(Math.random() * 360);
    const newBgSat = Math.floor(Math.random() * 101);
    const newBgLight = Math.floor(Math.random() * 101);

    setHue(newHue);
    setSaturation(newSat);
    setLightness(newLight);
    setBgHue(newBgHue);
    setBgSaturation(newBgSat);
    setBgLightness(newBgLight);

    setRandomPreview({
      hue: newHue,
      sat: newSat,
      light: newLight,
      bgHue: newBgHue,
      bgSat: newBgSat,
      bgLight: newBgLight,
    });

    const newColorway = getColorwayKey(newHue, newSat, newLight, newBgHue, newBgSat, newBgLight);
    trackColorway(newColorway);
    colorwayOnSettingsOpen.current = newColorway;

    setSelectedPreset(null);
    setSelectedCustomPreset(null);
  };

  const value: ThemeContextValue = {
    // Theme state
    hue,
    saturation,
    lightness,
    bgHue,
    bgSaturation,
    bgLightness,
    // Theme actions
    setHue,
    setSaturation,
    setLightness,
    setBgHue,
    setBgSaturation,
    setBgLightness,
    applyPreset,
    getColor,
    getBgColor,
    colorPickerDragCount,
    incrementColorPickerDragCount,
    prePickerSnapshotRef,
    // Preset state
    presets,
    customPresets,
    selectedPreset,
    selectedCustomPreset,
    activePresetIndex,
    randomPreview,
    // Preset actions
    setPresets,
    setCustomPresets,
    setSelectedPreset,
    setSelectedCustomPreset,
    setActivePresetIndex,
    savePreset,
    saveCustomPreset,
    deleteCustomPreset,
    randomizeTheme,
    // Colorway tracking
    uniqueColorways,
    seenColorways,
    trackColorway,
    trackCurrentColorway,
    getColorwayKey,
    // Live sync
    livePreset,
    isLiveActive,
    isLiveStreaming,
    pairingCode,
    setLivePreset,
    setIsLiveActive,
    setIsLiveStreaming,
    setPairingCode,
    saveLivePreset,
    applyLivePreset,
    localDragRef,
    setLocalDragging,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

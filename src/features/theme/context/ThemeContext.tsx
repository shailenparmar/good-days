import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { getItem, setItem, removeItem } from '@shared/storage';
import type { ColorPreset, ThemeState, ThemeActions, PresetState, PresetActions, ColorwayTracking } from '../types';

export const DEFAULT_PRESETS: ColorPreset[] = [
  { hue: 243, sat: 73, light: 64, bgHue: 88, bgSat: 97, bgLight: 75 },
  { hue: 241, sat: 69, light: 47, bgHue: 59, bgSat: 100, bgLight: 66 },
  { hue: 35, sat: 100, light: 40, bgHue: 30, bgSat: 100, bgLight: 11 },
  { hue: 229, sat: 61, light: 100, bgHue: 251, bgSat: 100, bgLight: 59 },
  { hue: 116, sat: 100, light: 53, bgHue: 96, bgSat: 100, bgLight: 0 },
];

interface ThemeContextValue extends ThemeState, ThemeActions, PresetState, PresetActions, ColorwayTracking {}

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

  // Preset state
  const [presets, setPresets] = useState<ColorPreset[]>(() => {
    const savedPresets = getItem('colorPresets');
    if (savedPresets) {
      const parsed = JSON.parse(savedPresets);
      while (parsed.length < 5) {
        parsed.push(DEFAULT_PRESETS[parsed.length]);
      }
      return parsed;
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

  // Save color settings
  useEffect(() => {
    setItem('colorHue', String(hue));
    setItem('colorSaturation', String(saturation));
    setItem('colorLightness', String(lightness));
    setItem('bgHue', String(bgHue));
    setItem('bgSaturation', String(bgSaturation));
    setItem('bgLightness', String(bgLightness));
  }, [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]);

  // Update Safari toolbar color when background changes
  useEffect(() => {
    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.setAttribute('content', `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`);
    }
  }, [bgHue, bgSaturation, bgLightness]);

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

  // Helper functions
  const getColor = (lightnessOffset: number = 0) => {
    const adjustedLightness = Math.max(0, Math.min(100, lightness + lightnessOffset));
    return `hsl(${hue}, ${saturation}%, ${adjustedLightness}%)`;
  };

  const getBgColor = () => {
    return `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)`;
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

    // Track colorway immediately for preset clicks
    const colorway = getColorwayKey(preset.hue, preset.sat, preset.light, preset.bgHue, preset.bgSat, preset.bgLight);
    trackColorway(colorway);
  };

  const savePreset = (index: number, preset: ColorPreset) => {
    const newPresets = [...presets];
    newPresets[index] = preset;
    setPresets(newPresets);
  };

  const saveCustomPreset = () => {
    const newPreset: ColorPreset = {
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

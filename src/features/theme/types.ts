export interface ColorPreset {
  hue: number;
  sat: number;
  light: number;
  bgHue: number;
  bgSat: number;
  bgLight: number;
}

export interface ThemeState {
  // Text color HSL
  hue: number;
  saturation: number;
  lightness: number;
  // Background color HSL
  bgHue: number;
  bgSaturation: number;
  bgLightness: number;
}

export interface ThemeActions {
  setHue: (hue: number) => void;
  setSaturation: (sat: number) => void;
  setLightness: (light: number) => void;
  setBgHue: (hue: number) => void;
  setBgSaturation: (sat: number) => void;
  setBgLightness: (light: number) => void;
  applyPreset: (preset: ColorPreset) => void;
  getColor: (lightnessOffset?: number) => string;
  getBgColor: () => string;
}

export interface PresetState {
  presets: ColorPreset[];
  customPresets: ColorPreset[];
  selectedPreset: number | null;
  selectedCustomPreset: number | null;
  activePresetIndex: number | null;
  randomPreview: ColorPreset;
}

export interface PresetActions {
  setPresets: (presets: ColorPreset[]) => void;
  setCustomPresets: (presets: ColorPreset[]) => void;
  setSelectedPreset: (index: number | null) => void;
  setSelectedCustomPreset: (index: number | null) => void;
  setActivePresetIndex: (index: number | null) => void;
  savePreset: (index: number, preset: ColorPreset) => void;
  saveCustomPreset: () => void;
  deleteCustomPreset: (index: number) => void;
  randomizeTheme: () => void;
}

export interface ColorwayTracking {
  uniqueColorways: number;
  seenColorways: Set<string>;
  trackColorway: (colorway: string) => void;
  getColorwayKey: (h: number, s: number, l: number, bh: number, bs: number, bl: number) => string;
}

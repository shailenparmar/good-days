// Easter egg tracking
// 13 total easter eggs to discover

export const EASTER_EGGS = [
  'scrambleTyping',      // typing in scramble mode
  'powerstatMode',       // settings + about open
  'supermode',           // settings + about + scramble open
  'scrambleHotkeyOn',    // scramble hotkey activated
  'minizenMode',         // minizen mode used
  'zenMode',             // zen mode used
  'timeCommand',         // \time used
  'scrambleHotkeyUsed',  // scramble hotkey actually used to toggle
  'spacebarRand',        // spacebar held on rand
  'arrowKeyPresets',     // arrow keys to navigate presets
  'copyMarkdown',        // copy markdown format in powerstat
  'selectColorText',     // selected color HSL/HEX text
  'mobileRand',          // rand button pressed in mobile mode
] as const;

export type EasterEgg = typeof EASTER_EGGS[number];

const STORAGE_KEY = 'easterEggsFound';

function getFound(): Set<EasterEgg> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return new Set(JSON.parse(saved) as EasterEgg[]);
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveFound(found: Set<EasterEgg>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...found]));
}

export function markEasterEggFound(egg: EasterEgg) {
  const found = getFound();
  if (!found.has(egg)) {
    found.add(egg);
    saveFound(found);
  }
}

export function getEasterEggCount(): { found: number; total: number } {
  return {
    found: getFound().size,
    total: EASTER_EGGS.length,
  };
}

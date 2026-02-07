// Easter egg tracking
// 8 visible easter eggs + 1 secret (clicking the counter when at 7.5/8)

export const EASTER_EGGS = [
  'scrambleTyping',      // typing in scramble mode
  'powerstatMode',       // settings + about open
  'superscramble',       // settings + about + scramble open
  'liveControl',         // used live control (phone controls laptop)
  'zenMode',             // zen mode used
  'timeCommand',         // \time used
  'spacebarRand',        // spacebar held on rand
  'selectColorText',     // used copy or paste in color stats widget
  'clickedEggCounter',   // SECRET: clicked on "7.5/8" to complete collection
] as const;

export type EasterEgg = typeof EASTER_EGGS[number];

const STORAGE_KEY = 'easterEggsFound';
const VALID_EGGS: Set<string> = new Set(EASTER_EGGS);

function getFound(): Set<EasterEgg> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      return new Set(parsed.filter(e => VALID_EGGS.has(e)) as EasterEgg[]);
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

export function isEasterEggFound(egg: EasterEgg): boolean {
  return getFound().has(egg);
}

export function getEasterEggCount(): { found: number; total: number } {
  const found = getFound();
  const hasSecret = found.has('clickedEggCounter');
  return {
    found: hasSecret ? found.size - 1 : found.size,
    total: EASTER_EGGS.length - 1,
  };
}

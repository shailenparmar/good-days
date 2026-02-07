// Easter egg tracking
// 8 visible easter eggs + 1 secret (clicking the counter when at 7.5/8)

export const EASTER_EGGS = [
  'scrambleTyping',      // typing in scramble mode
  'powerstatMode',       // settings + about open
  'superscramble',       // settings + about + scramble open
  'superscrambleTyping', // typing while in superscramble (theme randomizes)
  'zenMode',             // zen mode used
  'timeCommand',         // \time used
  'spacebarRand',        // spacebar held on rand
  'selectColorText',     // used copy or paste in color stats widget
  'clickedEggCounter',   // SECRET: clicked on "7.5/8" to complete collection
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

export function isEasterEggFound(egg: EasterEgg): boolean {
  return getFound().has(egg);
}

export function getEasterEggCount(): { found: number; total: number } {
  const found = getFound();
  // Don't count the secret egg in found, and display total as 14
  const hasSecret = found.has('clickedEggCounter');
  return {
    found: hasSecret ? found.size - 1 : found.size,
    total: EASTER_EGGS.length - 1, // 14, hiding the secret one
  };
}

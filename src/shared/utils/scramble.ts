// Global seed - changes when user types in supermode
let globalScrambleSeed = 0;

export function setScrambleSeed(seed: number) {
  globalScrambleSeed = seed;
}

// Scramble a single character (for JournalEditor - uses Math.random for live typing)
export function scrambleChar(char: string): string {
  if (/[a-zA-Z]/.test(char)) {
    const isUpper = char === char.toUpperCase();
    const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    return isUpper ? randomChar.toUpperCase() : randomChar;
  }
  if (/[0-9]/.test(char)) {
    return String(Math.floor(Math.random() * 10));
  }
  return char;
}

// Simple seeded random - deterministic for same seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

// Scramble text with seeded random - stable output until seed changes
// Uses text hash so different strings produce different results
export function scrambleText(text: string): string {
  // Hash the text for uniqueness
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  let scrambled = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // Unique seed per character position combining global seed, text hash, and position
    const seed = globalScrambleSeed * 1000 + hash + i;
    const rand = seededRandom(seed);

    if (/[a-zA-Z]/.test(char)) {
      const isUpper = char === char.toUpperCase();
      const randomChar = String.fromCharCode(97 + Math.floor(rand * 26));
      scrambled += isUpper ? randomChar.toUpperCase() : randomChar;
    } else if (/[0-9]/.test(char)) {
      scrambled += String(Math.floor(rand * 10));
    } else {
      scrambled += char;
    }
  }
  return scrambled;
}

// Simple seeded pseudo-random number generator
// Returns a function that produces deterministic sequence for a given seed
function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Global seed for supermode scrambling - changes on each user input
let globalScrambleSeed = 0;

export function setScrambleSeed(seed: number) {
  globalScrambleSeed = seed;
}

// Scramble a single character using seeded random
function scrambleCharSeeded(char: string, random: () => number): string {
  if (/[a-zA-Z]/.test(char)) {
    const isUpper = char === char.toUpperCase();
    const randomChar = String.fromCharCode(97 + Math.floor(random() * 26));
    return isUpper ? randomChar.toUpperCase() : randomChar;
  }
  if (/[0-9]/.test(char)) {
    return String(Math.floor(random() * 10));
  }
  return char;
}

// Scramble a single character (for JournalEditor - uses Math.random)
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

// Scramble a string - uses seeded random for consistent output
// The seed is based on the text content + globalScrambleSeed
// So same text produces same scrambled result until seed changes
export function scrambleText(text: string): string {
  // Create a seed from the text and global seed
  let textHash = 0;
  for (let i = 0; i < text.length; i++) {
    textHash = ((textHash << 5) - textHash + text.charCodeAt(i)) | 0;
  }
  const seed = textHash ^ globalScrambleSeed;
  const random = createSeededRandom(seed);

  let scrambled = '';
  for (const char of text) {
    scrambled += scrambleCharSeeded(char, random);
  }
  return scrambled;
}

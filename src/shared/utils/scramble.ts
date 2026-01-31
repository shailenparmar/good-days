// Scramble a single character
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

// Scramble a string
export function scrambleText(text: string): string {
  let scrambled = '';
  for (const char of text) {
    scrambled += scrambleChar(char);
  }
  return scrambled;
}

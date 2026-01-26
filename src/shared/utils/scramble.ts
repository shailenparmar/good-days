// Text scrambling utility

export function scrambleChar(char: string): string {
  // Scramble letters
  if (char.match(/[a-zA-Z]/)) {
    const isUpper = char === char.toUpperCase();
    const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    return isUpper ? randomChar.toUpperCase() : randomChar;
  }
  // Scramble digits
  if (char.match(/[0-9]/)) {
    return String(Math.floor(Math.random() * 10));
  }
  return char;
}

export function scrambleText(text: string): string {
  return text.split('').map(scrambleChar).join('');
}

export function scrambleNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    // Scramble text nodes only
    const text = node.textContent || '';
    node.textContent = scrambleText(text);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // Recursively scramble child nodes
    Array.from(node.childNodes).forEach(child => scrambleNode(child));
  }
}

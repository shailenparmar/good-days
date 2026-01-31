// App-level encryption for backups
// Uses AES-GCM with a derived key from a fixed passphrase

const APP_SECRET = 'good-days-backup-v1-2026';

async function getKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(APP_SECRET),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('good-days-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await getKey();

  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptText(encryptedBase64: string): Promise<string> {
  const decoder = new TextDecoder();
  const key = await getKey();

  // Decode base64 and split IV from ciphertext
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return decoder.decode(decrypted);
}

export function formatEncryptedBackup(encryptedContent: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `good days encrypted backup ${dateStr}\n\n${encryptedContent}`;
}

export function parseEncryptedBackup(fileContent: string): string | null {
  // Check for the header
  if (!fileContent.startsWith('good days encrypted backup')) {
    return null;
  }

  // Extract the encrypted content (after the header line and blank line)
  const lines = fileContent.split('\n');
  // Skip header line and any blank lines
  let startIndex = 1;
  while (startIndex < lines.length && lines[startIndex].trim() === '') {
    startIndex++;
  }

  return lines.slice(startIndex).join('\n').trim();
}

// Auth Web Worker — runs PBKDF2 + key derivation + DEK unwrap off the main thread.
//
// Phase 1 of the foolproof unlock redesign: keep the UI thread painting while
// the password verification + key pipeline runs in a worker. Returns one
// atomic result message containing both the unlock decision AND (on success)
// the DEK JWK ready for sessionStorage.
//
// Message protocol:
//   in:  { id, type: 'verifyAndDerive', password, salt, expectedHash, wrappedDEK?, encryptSalt }
//   out: { id, ok: false }
//        { id, ok: true, mode: 'dek' | 'password', keyJWK }
//        { id, error: string } — unexpected failure (treated as ok:false at call site)

type VerifyRequest = {
  id: string;
  type: 'verifyAndDerive';
  password: string;
  salt: string;
  expectedHash: string;
  wrappedDEK: string | null;
  encryptSalt: string;
};

type WarmupRequest = {
  id: string;
  type: 'warmup';
};

type Request = VerifyRequest | WarmupRequest;

type Response =
  | { id: string; ok: true; mode: 'dek' | 'password'; keyJWK: JsonWebKey }
  | { id: string; ok: false }
  | { id: string; warmed: true }
  | { id: string; error: string };

// --- Crypto primitives (mirror src/shared/crypto.ts + useAuth.hashPassword) ---

async function pbkdf2HashHex(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const arr = Array.from(new Uint8Array(derivedBits));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function derivePasswordKEK(password: string, encryptSalt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(encryptSalt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable for JWK export
    ['encrypt', 'decrypt']
  );
}

async function unwrapDEKWithKEK(wrappedBase64: string, kek: CryptoKey): Promise<CryptoKey> {
  const combined = Uint8Array.from(atob(wrappedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const rawDEK = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, data);
  return crypto.subtle.importKey(
    'raw',
    rawDEK,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// --- Message handler ---

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;

  if (req.type === 'warmup') {
    // Touch crypto.subtle so JIT/key-import overhead is paid before the user
    // finishes typing. Cheap throwaway — not security-relevant.
    try {
      const encoder = new TextEncoder();
      await crypto.subtle.importKey(
        'raw',
        encoder.encode('warmup'),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const res: Response = { id: req.id, warmed: true };
      (self as unknown as Worker).postMessage(res);
    } catch {
      const res: Response = { id: req.id, warmed: true };
      (self as unknown as Worker).postMessage(res);
    }
    return;
  }

  if (req.type === 'verifyAndDerive') {
    try {
      const inputHash = await pbkdf2HashHex(req.password, req.salt);
      if (!timingSafeEqual(inputHash, req.expectedHash)) {
        const res: Response = { id: req.id, ok: false };
        (self as unknown as Worker).postMessage(res);
        return;
      }

      const passwordKEK = await derivePasswordKEK(req.password, req.encryptSalt);

      if (req.wrappedDEK) {
        const dek = await unwrapDEKWithKEK(req.wrappedDEK, passwordKEK);
        const jwk = await crypto.subtle.exportKey('jwk', dek);
        const res: Response = { id: req.id, ok: true, mode: 'dek', keyJWK: jwk };
        (self as unknown as Worker).postMessage(res);
      } else {
        // Legacy mode (pre-DEK): the password KEK itself is the encryption key.
        // DEK migration happens later on next password change.
        const jwk = await crypto.subtle.exportKey('jwk', passwordKEK);
        const res: Response = { id: req.id, ok: true, mode: 'password', keyJWK: jwk };
        (self as unknown as Worker).postMessage(res);
      }
    } catch (err) {
      const res: Response = {
        id: req.id,
        error: err instanceof Error ? err.message : String(err),
      };
      (self as unknown as Worker).postMessage(res);
    }
  }
};

// Make this file a module (for Vite worker resolution).
export {};

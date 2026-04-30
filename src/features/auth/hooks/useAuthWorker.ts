// Typed wrapper around auth.worker.ts.
//
// Holds one persistent worker for the lifetime of the hook. Each request gets
// a unique id; resolution is matched on the response id. This means concurrent
// requests are safe (we don't depend on FIFO ordering), even though in practice
// the unlock flow only fires one at a time.

import { useEffect, useRef, useCallback } from 'react';

export type VerifyResult =
  | { ok: true; mode: 'dek' | 'password'; keyJWK: JsonWebKey }
  | { ok: false }
  | { ok: false; error: string };

type Pending = (result: VerifyResult | { warmed: true }) => void;

export function useAuthWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, Pending>>(new Map());

  useEffect(() => {
    const worker = new Worker(new URL('../auth.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { id: string } & Record<string, unknown>;
      const resolver = pendingRef.current.get(data.id);
      if (!resolver) return;
      pendingRef.current.delete(data.id);

      if ('warmed' in data) {
        resolver({ warmed: true });
        return;
      }
      if ('error' in data && typeof data.error === 'string') {
        resolver({ ok: false, error: data.error });
        return;
      }
      if ('ok' in data && data.ok === true) {
        resolver({
          ok: true,
          mode: data.mode as 'dek' | 'password',
          keyJWK: data.keyJWK as JsonWebKey,
        });
        return;
      }
      resolver({ ok: false });
    };

    worker.onerror = (err) => {
      console.error('[gdays] auth worker error', err);
    };

    workerRef.current = worker;

    // Pre-warm on mount so JIT/key-import overhead is paid before the user
    // finishes typing their password.
    const warmupId = `warmup-${Date.now()}`;
    pendingRef.current.set(warmupId, () => {
      // ignore — this is purely for cache warming
    });
    worker.postMessage({ id: warmupId, type: 'warmup' });

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const verifyAndDerive = useCallback(
    (params: {
      password: string;
      salt: string;
      expectedHash: string;
      wrappedDEK: string | null;
      encryptSalt: string;
    }): Promise<VerifyResult> => {
      return new Promise((resolve) => {
        const worker = workerRef.current;
        if (!worker) {
          resolve({ ok: false, error: 'worker-not-ready' });
          return;
        }
        const id = `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        pendingRef.current.set(id, (result) => {
          if ('warmed' in result) return;
          resolve(result as VerifyResult);
        });
        worker.postMessage({
          id,
          type: 'verifyAndDerive',
          password: params.password,
          salt: params.salt,
          expectedHash: params.expectedHash,
          wrappedDEK: params.wrappedDEK,
          encryptSalt: params.encryptSalt,
        });
      });
    },
    []
  );

  return { verifyAndDerive };
}

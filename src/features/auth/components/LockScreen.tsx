import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useTheme } from '@features/theme';
import { logAction } from '@shared/logger';

interface LockScreenProps {
  passwordInput: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent, password: string) => Promise<boolean>;
}

export function LockScreen({ passwordInput, onPasswordChange, onSubmit }: LockScreenProps) {
  const { getColor, getBgColor } = useTheme();
  const [flashState, setFlashState] = useState<'none' | 'red'>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Rate limiting
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const isCoolingDown = cooldownEnd !== null && cooldownRemaining > 0;

  useEffect(() => {
    if (!cooldownEnd) return;

    const tick = () => {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownEnd(null);
        setCooldownRemaining(0);
        // Defer focus until after React re-renders (input is still disabled in DOM)
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        setCooldownRemaining(remaining);
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  // Placeholder animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = isSubmitting
    ? 'checking'
    : isCoolingDown
      ? String(cooldownRemaining)
      : 'password';
  const showPlaceholder =
    isSubmitting || isCoolingDown || (passwordInput.length === 0 && !isFocused);

  useEffect(() => {
    if (!showPlaceholder) return;

    if (animPhase === 'bold') {
      if (boldCount >= placeholderText.length) {
        setAnimPhase('unbold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => setBoldCount(c => c + 1), 83);
      return () => clearTimeout(timer);
    }

    if (animPhase === 'unbold') {
      if (boldCount >= placeholderText.length) {
        setAnimPhase('bold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => setBoldCount(c => c + 1), 83);
      return () => clearTimeout(timer);
    }
  }, [showPlaceholder, boldCount, animPhase]);

  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder]);

  // Reset animation when cooldown number changes
  useEffect(() => {
    if (isCoolingDown) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [cooldownRemaining, isCoolingDown]);

  // Reset animation when entering checking state — kicks the sweep on submit
  useEffect(() => {
    if (isSubmitting) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [isSubmitting]);

  // Window-level keydown:
  // - Printable char while input not focused → focus input (legacy behavior)
  // - Enter → fire submit explicitly. Don't depend on form's onSubmit, which
  //   silently fails when the input has lost focus mid-type (the "click out
  //   then back in" repro). Enter at window level ALWAYS triggers submit when
  //   not submitting/cooling, regardless of focus.
  const handleSubmitRef = useRef<((e: React.FormEvent) => void) | null>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitRef.current?.({ preventDefault: () => {} } as React.FormEvent);
        return;
      }

      if (document.activeElement === inputRef.current) return;
      if (e.key.length !== 1) return;
      inputRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keep the ref pointed at the latest handleSubmit so the window-level
  // Enter listener always calls the version with current state closures.
  useEffect(() => {
    handleSubmitRef.current = (e) => { void handleSubmit(e); };
  });

  const flashRed = () => {
    // 4 pulses over 600ms — first pulse held longer so it survives a busy render
    // thread on slow devices. Previously 3×80ms pulses could coalesce invisibly.
    setFlashState('red');
    setTimeout(() => setFlashState('none'), 150);
    setTimeout(() => setFlashState('red'), 250);
    setTimeout(() => setFlashState('none'), 350);
    setTimeout(() => setFlashState('red'), 450);
    setTimeout(() => setFlashState('none'), 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous proof that submit fired — visible in action log even if
    // the UI never paints. Pair with auth.unlock to measure perceived latency.
    logAction('auth.submit', {
      ts: Date.now(),
      via: document.activeElement === inputRef.current ? 'input-focused' : 'window',
    });
    if (isSubmitting) {
      logAction('auth.submit.ignored', { reason: 'alreadySubmitting' });
      return;
    }
    if (isCoolingDown) {
      logAction('auth.submit.ignored', { reason: 'cooldown' });
      return;
    }

    // Read password from the DOM directly — React state may be stale if user typed fast
    const password = inputRef.current?.value || '';

    // CRITICAL: flushSync forces React to commit isSubmitting=true synchronously,
    // not batch it with the unlock result. Without this, on a fast worker pipeline
    // React would merge isSubmitting=true and isLocked=false into one render and
    // the "checking" UI never paints — user sees nothing then sudden unlock.
    flushSync(() => setIsSubmitting(true));

    // Double rAF: first frame commits, second frame guarantees paint before
    // we hand control to the worker. Single rAF can fire before paint.
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    logAction('auth.submit.painted');
    const success = await onSubmit(e, password);

    if (success) {
      // Lock screen is about to unmount — leave isSubmitting=true so any final
      // paint stays in the "checking" state instead of flashing back to "password".
      // Blur input so document.activeElement falls cleanly to body before
      // unmount; otherwise the first post-unlock ESC is swallowed by the
      // App ESC handler's tagName === 'input' early-return.
      inputRef.current?.blur();
      setFailedAttempts(0);
      setCooldownEnd(null);
      setCooldownRemaining(0);
      return;
    }

    setIsSubmitting(false);
    {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 3) {
        // Exponential backoff: 1s, 2s, 4s, 8s, max 32s
        const delay = Math.min(Math.pow(2, newAttempts - 3), 32) * 1000;
        setCooldownEnd(Date.now() + delay);
        onPasswordChange('');
      }

      flashRed();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const textColor = getColor();
  const borderDefault = 'hsla(var(--h), var(--s), var(--l), 0.6)';
  const activeColor = 'hsl(var(--h), var(--s), max(0%, calc(var(--l) * 0.65)))';
  const hoverBg = 'hsla(var(--h), var(--s), 50%, 0.2)';

  const getBorderColor = () => {
    if (flashState === 'red') return '#ef4444';
    if (isSubmitting) return textColor;
    if (isPressed) return activeColor;
    if (isFocused || isHovered || passwordInput) return textColor;
    return borderDefault;
  };

  const getBackgroundColor = () => {
    if (isHovered || isFocused) return hoverBg;
    return 'transparent';
  };

  return (
    <div
      className="relative flex items-center justify-center h-screen"
      style={{ backgroundColor: getBgColor() }}
      onMouseDown={(e) => {
        if (e.target !== inputRef.current) {
          inputRef.current?.blur();
        }
      }}
    >
      <span
        className="fixed top-4 left-4 text-2xl font-extrabold font-mono tracking-tight select-none"
        style={{ color: textColor }}
      >
        good days
      </span>
      <form onSubmit={handleSubmit} className="relative w-72" role="form" aria-label="Unlock journal">
        {isSubmitting ? (
          // Submit-in-progress state. Same dimensions as the input so layout
          // doesn't jump. Bordered with textColor + tinted bg as visual proof
          // that submit registered. No copy.
          <div
            className="w-full px-3 py-2 text-xs font-mono font-bold rounded"
            style={{
              backgroundColor: 'hsla(var(--h), var(--s), var(--l), 0.12)',
              border: `3px solid ${textColor}`,
              color: textColor,
              minHeight: '36px',
            }}
            aria-live="polite"
            aria-label="Checking password"
          />
        ) : (
          <>
            <input
              ref={inputRef}
              type="password"
              value={passwordInput}
              onChange={(e) => onPasswordChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
              onMouseDown={() => setIsPressed(true)}
              onMouseUp={() => setIsPressed(false)}
              disabled={isCoolingDown}
              className={`w-full px-3 py-2 text-xs font-mono font-bold rounded${flashState === 'red' ? ' status-pulse-red' : ''}`}
              style={{
                backgroundColor: getBackgroundColor(),
                border: `3px solid ${getBorderColor()}`,
                color: getBorderColor(),
                caretColor: textColor,
                outline: 'none',
              }}
              aria-label="Password"
            />
            {showPlaceholder && (
              <div
                className="absolute top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none"
                style={{ color: getColor(), opacity: 0.85, left: '14px' }}
              >
                {animPhase === 'bold' ? (
                  <>
                    <span className="font-bold">{placeholderText.slice(0, boldCount)}</span>
                    <span>{placeholderText.slice(boldCount)}</span>
                  </>
                ) : (
                  <>
                    <span>{placeholderText.slice(0, boldCount)}</span>
                    <span className="font-bold">{placeholderText.slice(boldCount)}</span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
}

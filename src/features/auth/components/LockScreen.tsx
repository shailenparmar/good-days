import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@features/theme';

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
  const placeholderText = isCoolingDown ? String(cooldownRemaining) : 'password';
  const showPlaceholder = isCoolingDown || (passwordInput.length === 0 && !isFocused);

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

  // Auto-focus input when user starts typing anywhere on the lock screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;

      inputRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const flashRed = () => {
    setFlashState('red');
    setTimeout(() => setFlashState('none'), 80);
    setTimeout(() => setFlashState('red'), 160);
    setTimeout(() => setFlashState('none'), 240);
    setTimeout(() => setFlashState('red'), 320);
    setTimeout(() => setFlashState('none'), 400);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (isCoolingDown) return;

    // Read password from the DOM directly — React state may be stale if user typed fast
    const password = inputRef.current?.value || '';
    setIsSubmitting(true);
    // Yield a frame so React can paint the disabled state before PBKDF2 blocks the thread
    await new Promise(r => requestAnimationFrame(r));
    const success = await onSubmit(e, password);
    setIsSubmitting(false);

    if (success) {
      setFailedAttempts(0);
      setCooldownEnd(null);
      setCooldownRemaining(0);
    } else {
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
          disabled={isSubmitting || isCoolingDown}
          className="w-full px-3 py-2 text-xs font-mono font-bold rounded"
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
      </form>
    </div>
  );
}

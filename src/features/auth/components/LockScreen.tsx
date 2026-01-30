import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@features/theme';

interface LockScreenProps {
  passwordInput: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<boolean>;
}

export function LockScreen({ passwordInput, onPasswordChange, onSubmit }: LockScreenProps) {
  const { getColor, getBgColor, hue, saturation, lightness } = useTheme();
  const [flashState, setFlashState] = useState<'none' | 'red'>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Placeholder animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = 'password';
  const showPlaceholder = passwordInput.length === 0 && !isFocused;

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

    setIsSubmitting(true);
    const success = await onSubmit(e);
    setIsSubmitting(false);

    if (!success) {
      flashRed();
      // Refocus input after failed attempt so cursor stays active
      // Use setTimeout to ensure DOM has updated after isSubmitting becomes false
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const textColor = getColor();
  const borderDefault = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const activeColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

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

  const getInputColor = () => {
    if (flashState === 'red') return '#ef4444';
    return getColor();
  };

  return (
    <div
      className="relative flex items-center justify-center h-screen"
      style={{ backgroundColor: getBgColor() }}
    >
      <span
        className="fixed top-4 left-4 text-2xl font-extrabold font-mono tracking-tight"
        style={{ color: getInputColor() }}
      >
        good
      </span>
      <span
        className="fixed bottom-4 right-4 text-2xl font-extrabold font-mono tracking-tight"
        style={{ color: getInputColor() }}
      >
        days
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
          disabled={isSubmitting}
          className="w-full px-3 py-2 text-xs font-mono font-bold rounded"
          style={{
            backgroundColor: getBackgroundColor(),
            border: `3px solid ${getBorderColor()}`,
            color: getBorderColor(),
            caretColor: textColor,
            outline: 'none',
          }}
          autoFocus
          aria-label="Password"
        />
        {showPlaceholder && (
          <div
            className="absolute top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none"
            style={{ color: getColor(), opacity: 0.9, left: '14px' }}
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

import { useState, useEffect } from 'react';
import { useTheme } from '@features/theme';

interface LockScreenProps {
  passwordInput: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<boolean>;
}

export function LockScreen({ passwordInput, onPasswordChange, onSubmit }: LockScreenProps) {
  const { getColor, getBgColor } = useTheme();
  const [flashState, setFlashState] = useState<'none' | 'red'>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  // Placeholder animation
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const placeholderText = 'type here';
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
    }
  };

  const getInputColor = () => {
    if (flashState === 'red') return '#ef4444';
    return getColor();
  };

  return (
    <div
      className="flex items-center justify-center h-screen"
      style={{ backgroundColor: getBgColor() }}
    >
      <form onSubmit={handleSubmit} className="relative">
        <span
          className="absolute -top-5 left-0 text-xs font-mono font-bold"
          style={{ color: getInputColor() }}
        >
          good
        </span>
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => onPasswordChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isSubmitting}
          className="px-3 py-2 text-xs font-mono font-bold rounded"
          style={{
            backgroundColor: getBgColor(),
            border: `3px solid ${getInputColor()}`,
            color: getInputColor(),
            caretColor: getInputColor(),
            outline: 'none',
          }}
          autoFocus
        />
        <span
          className="absolute -bottom-5 right-0 text-xs font-mono font-bold"
          style={{ color: getInputColor() }}
        >
          days
        </span>
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

import { useState, useEffect } from 'react';
import { useTheme } from '@features/theme';
import { FunctionButton } from '@shared/components';

type PasswordStep = 'old' | 'new' | 'confirm' | 'set' | 'set-confirm';
type FlashState = 'none' | 'green' | 'red';

interface PasswordSettingsProps {
  hasPassword: boolean;
  verifyPassword: (password: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<boolean>;
  removePassword: () => void;
}

// Get placeholder text for each step
function getPlaceholderText(step: PasswordStep): string {
  switch (step) {
    case 'old': return 'old password';
    case 'new': return 'new password';
    case 'confirm': return 'new password again';
    case 'set': return 'type here';
    case 'set-confirm': return 'one more time';
  }
}

export function PasswordSettings({ hasPassword, verifyPassword, setPassword, removePassword }: PasswordSettingsProps) {
  const { getColor, hue, saturation, lightness } = useTheme();

  // Core state
  const [step, setStep] = useState<PasswordStep>(hasPassword ? 'old' : 'set');
  const [input, setInput] = useState('');
  const [newPasswordTemp, setNewPasswordTemp] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [flashState, setFlashState] = useState<FlashState>('none');

  // Input interaction state
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Placeholder animation state
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');

  // Label animation state (for "esc to lock" after save)
  const [labelBoldCount, setLabelBoldCount] = useState(0);
  const [labelAnimPhase, setLabelAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const labelText = 'esc to lock';

  // Derived state
  const placeholderText = getPlaceholderText(step);
  const showPlaceholder = !input && !isSaving && !isFocused;
  const isDisabled = isSaving || flashState === 'green';

  // Sync step with hasPassword prop
  useEffect(() => {
    if (!isSaving) {
      setStep(hasPassword ? 'old' : 'set');
    }
  }, [hasPassword, isSaving]);

  // Placeholder animation - runs when placeholder is visible
  useEffect(() => {
    if (!showPlaceholder) return;

    const maxCount = placeholderText.length;
    if (boldCount >= maxCount) {
      setAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [showPlaceholder, boldCount, animPhase, placeholderText.length]);

  // Reset placeholder animation when it becomes visible
  useEffect(() => {
    if (showPlaceholder) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder]);

  // Label animation - runs when saving
  useEffect(() => {
    if (!isSaving) return;

    const maxCount = labelText.length;
    if (labelBoldCount >= maxCount) {
      setLabelAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setLabelBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setLabelBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [isSaving, labelBoldCount, labelAnimPhase]);

  // Reset label animation when saving starts
  useEffect(() => {
    if (isSaving) {
      setLabelBoldCount(0);
      setLabelAnimPhase('bold');
    }
  }, [isSaving]);

  // Flash helpers
  const flashGreen = (onComplete: () => void) => {
    setFlashState('green');
    setIsFocused(false); // Reset focus since input gets disabled
    setTimeout(() => {
      setFlashState('none');
      onComplete();
    }, 600);
  };

  const flashRed = () => {
    setFlashState('red');
    setTimeout(() => setFlashState('none'), 80);
    setTimeout(() => setFlashState('red'), 160);
    setTimeout(() => setFlashState('none'), 240);
    setTimeout(() => setFlashState('red'), 320);
    setTimeout(() => setFlashState('none'), 400);
  };

  // Styling
  const textColor = getColor();
  const dividerColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const activeColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

  const getBorderColor = () => {
    if (flashState === 'green' || isSaving) return '#00ff00';
    if (flashState === 'red') return '#ff0000';
    if (isPressed) return activeColor;
    if (isFocused || isHovered || input) return textColor;
    return dividerColor;
  };

  const getBackgroundColor = () => {
    if (isHovered || isFocused) return hoverBg;
    return 'transparent';
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    switch (step) {
      case 'old': {
        const isValid = await verifyPassword(input.trim());
        if (isValid) {
          flashGreen(() => {
            setStep('new');
            setInput('');
          });
        } else {
          flashRed();
          setInput('');
        }
        break;
      }

      case 'new':
        flashGreen(() => {
          setNewPasswordTemp(input.trim());
          setStep('confirm');
          setInput('');
        });
        break;

      case 'confirm':
        if (input.trim() === newPasswordTemp) {
          await setPassword(newPasswordTemp);
          setInput('');
          setNewPasswordTemp('');
          setIsSaving(true);
        } else {
          flashRed();
          setStep('old');
          setInput('');
          setNewPasswordTemp('');
        }
        break;

      case 'set':
        flashGreen(() => {
          setNewPasswordTemp(input.trim());
          setStep('set-confirm');
          setInput('');
        });
        break;

      case 'set-confirm':
        if (input.trim() === newPasswordTemp) {
          await setPassword(newPasswordTemp);
          setInput('');
          setNewPasswordTemp('');
          setIsSaving(true);
        } else {
          flashRed();
          setStep('set');
          setInput('');
          setNewPasswordTemp('');
        }
        break;
    }
  };

  // Render animated text helper
  const renderAnimatedText = (text: string, count: number, phase: 'bold' | 'unbold') => {
    if (phase === 'bold') {
      return (
        <>
          <span className="font-bold">{text.slice(0, count)}</span>
          <span>{text.slice(count)}</span>
        </>
      );
    }
    return (
      <>
        <span>{text.slice(0, count)}</span>
        <span className="font-bold">{text.slice(count)}</span>
      </>
    );
  };

  return (
    <div className="space-y-2">
      {/* Label */}
      <div className="text-xs font-mono select-none" style={{ color: textColor }}>
        {isSaving ? (
          renderAnimatedText(labelText, labelBoldCount, labelAnimPhase)
        ) : (
          <span className="font-bold">{hasPassword ? 'change password' : 'set password'}</span>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            type={isSaving ? 'text' : 'password'}
            value={isSaving ? '' : input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onMouseEnter={() => !isDisabled && setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
            onMouseDown={() => !isDisabled && setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            disabled={isDisabled}
            className="w-full px-3 py-2 text-xs font-mono font-bold rounded"
            style={{
              backgroundColor: getBackgroundColor(),
              border: `3px solid ${getBorderColor()}`,
              color: getBorderColor(),
              caretColor: textColor,
              outline: 'none',
              cursor: isDisabled ? 'not-allowed' : 'text',
            }}
          />

          {/* Saved message */}
          {isSaving && (
            <div
              className="absolute top-1/2 -translate-y-1/2 left-3.5 text-xs font-mono font-bold pointer-events-none select-none"
              style={{ color: '#00ff00' }}
            >
              password saved
            </div>
          )}

          {/* Animated placeholder */}
          {showPlaceholder && (
            <div
              className="absolute top-1/2 -translate-y-1/2 left-3.5 text-xs font-mono pointer-events-none select-none"
              style={{ color: textColor, opacity: 0.9 }}
            >
              {renderAnimatedText(placeholderText, boldCount, animPhase)}
            </div>
          )}
        </div>
      </form>

      {/* Remove password button */}
      {hasPassword && !isSaving && (
        <div className="mt-2">
          <FunctionButton onClick={removePassword} size="sm">
            <span>remove password</span>
          </FunctionButton>
        </div>
      )}
    </div>
  );
}

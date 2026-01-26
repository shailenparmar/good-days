import { useState, useEffect } from 'react';
import { useTheme } from '@features/theme';

type PasswordStep = 'old' | 'new' | 'confirm' | 'set' | 'set-confirm';
type FlashState = 'none' | 'green' | 'red';

interface PasswordSettingsProps {
  hasPassword: boolean;
  verifyPassword: (password: string) => boolean;
  setPassword: (password: string) => void;
}

export function PasswordSettings({ hasPassword, verifyPassword, setPassword }: PasswordSettingsProps) {
  const { getColor, hue, saturation, lightness } = useTheme();
  const [step, setStep] = useState<PasswordStep>(hasPassword ? 'old' : 'set');
  const [input, setInput] = useState('');
  const [newPasswordTemp, setNewPasswordTemp] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [flashState, setFlashState] = useState<FlashState>('none');
  const [animatingPlaceholder, setAnimatingPlaceholder] = useState('');
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold' | 'done'>('done');
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Handle bold/unbold animation at 12fps
  useEffect(() => {
    if (!animatingPlaceholder || animPhase === 'done') return;

    if (animPhase === 'bold') {
      if (boldCount >= animatingPlaceholder.length) {
        // Start unbold phase
        setAnimPhase('unbold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setBoldCount(c => c + 1);
      }, 83); // ~12fps
      return () => clearTimeout(timer);
    }

    if (animPhase === 'unbold') {
      if (boldCount >= animatingPlaceholder.length) {
        // Loop back to bold phase
        setAnimPhase('bold');
        setBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setBoldCount(c => c + 1);
      }, 83); // ~12fps
      return () => clearTimeout(timer);
    }
  }, [animatingPlaceholder, boldCount, animPhase]);

  const startPlaceholderAnimation = (text: string) => {
    setAnimatingPlaceholder(text);
    setBoldCount(0);
    setAnimPhase('bold');
  };

  // Animate "type here" on initial mount for set password flow
  useEffect(() => {
    if (step === 'set' && !hasPassword) {
      startPlaceholderAnimation('type here');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flashGreen = (onComplete: () => void) => {
    setFlashState('green');
    setTimeout(() => {
      setFlashState('none');
      onComplete();
    }, 200);
  };

  const flashRed = () => {
    // Triple flicker
    setFlashState('red');
    setTimeout(() => setFlashState('none'), 80);
    setTimeout(() => setFlashState('red'), 160);
    setTimeout(() => setFlashState('none'), 240);
    setTimeout(() => setFlashState('red'), 320);
    setTimeout(() => setFlashState('none'), 400);
  };

  const dividerColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;
  const textColor = getColor();
  const activeColor = `hsl(${hue}, ${saturation}%, ${Math.max(0, lightness * 0.65)}%)`;
  const hoverBg = `hsla(${hue}, ${saturation}%, 50%, 0.2)`;

  const getBorderColor = () => {
    if (flashState === 'green') return '#00ff00';
    if (flashState === 'red') return '#ff0000';
    if (isSaving) return '#00ff00';
    if (isPressed) return activeColor;
    if (isFocused || isHovered || input) return textColor;
    return dividerColor;
  };

  const getBackgroundColor = () => {
    if (isHovered || isFocused) return hoverBg;
    return 'transparent';
  };

  const showAnimatedPlaceholder = animatingPlaceholder && !input;

  const getPlaceholder = () => {
    switch (step) {
      case 'old': return 'old password';
      case 'new': return 'new password';
      case 'confirm': return 'new password again';
      case 'set': return 'type here';
      case 'set-confirm': return 'one more time';
    }
  };

  const getLabel = () => {
    return hasPassword ? 'change password' : 'set password';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    switch (step) {
      case 'old':
        if (verifyPassword(input.trim())) {
          flashGreen(() => {
            setStep('new');
            setInput('');
            startPlaceholderAnimation('new password');
          });
        } else {
          flashRed();
          setInput('');
        }
        break;

      case 'new':
        flashGreen(() => {
          setNewPasswordTemp(input.trim());
          setStep('confirm');
          setInput('');
          startPlaceholderAnimation('new password again');
        });
        break;

      case 'confirm':
        if (input.trim() === newPasswordTemp) {
          flashGreen(() => {
            setPassword(newPasswordTemp);
            setInput('');
            setNewPasswordTemp('');
            setIsSaving(true);
            setTimeout(() => {
              setIsSaving(false);
              setStep('old');
            }, 5000);
          });
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
          startPlaceholderAnimation('one more time');
        });
        break;

      case 'set-confirm':
        if (input.trim() === newPasswordTemp) {
          flashGreen(() => {
            setPassword(newPasswordTemp);
            setInput('');
            setNewPasswordTemp('');
            setIsSaving(true);
            setTimeout(() => {
              setIsSaving(false);
              setStep('old');
            }, 5000);
          });
        } else {
          flashRed();
          setStep('set');
          setInput('');
          setNewPasswordTemp('');
        }
        break;
    }
  };

  return (
    <div className="space-y-2">
      <style>
        {`
          .password-input::placeholder {
            color: ${textColor};
            opacity: 0.9;
          }
        `}
      </style>
      <div className="text-xs font-mono font-bold" style={{ color: getColor() }}>
        {getLabel()}
      </div>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            type={isSaving ? 'text' : 'password'}
            value={isSaving ? '' : input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value) setAnimatingPlaceholder('');
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onMouseEnter={() => !isSaving && setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
            onMouseDown={() => !isSaving && setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            placeholder={showAnimatedPlaceholder ? '' : (isSaving ? 'password saved' : getPlaceholder())}
            disabled={isSaving}
            className="password-input w-full px-3 py-2 text-xs font-mono font-bold rounded"
            style={{
              backgroundColor: getBackgroundColor(),
              border: `3px solid ${getBorderColor()}`,
              color: textColor,
              caretColor: textColor,
              outline: 'none',
              cursor: isSaving ? 'not-allowed' : 'text',
            }}
          />
          {showAnimatedPlaceholder && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none"
              style={{ color: getColor(), opacity: 0.9 }}
            >
              {animPhase === 'bold' ? (
                <>
                  <span className="font-bold">{animatingPlaceholder.slice(0, boldCount)}</span>
                  <span>{animatingPlaceholder.slice(boldCount)}</span>
                </>
              ) : animPhase === 'unbold' ? (
                <>
                  <span>{animatingPlaceholder.slice(0, boldCount)}</span>
                  <span className="font-bold">{animatingPlaceholder.slice(boldCount)}</span>
                </>
              ) : (
                <span>{animatingPlaceholder}</span>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

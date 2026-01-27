import { useState, useEffect } from 'react';
import { useTheme } from '@features/theme';

type PasswordStep = 'old' | 'new' | 'confirm' | 'set' | 'set-confirm';
type FlashState = 'none' | 'green' | 'red';

interface PasswordSettingsProps {
  hasPassword: boolean;
  verifyPassword: (password: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<boolean>;
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

  // Label animation state (for "esc to lock")
  const [labelBoldCount, setLabelBoldCount] = useState(0);
  const [labelAnimPhase, setLabelAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const labelText = 'esc to lock';

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

  // Handle label bold/unbold animation at 12fps (for "esc to lock")
  useEffect(() => {
    if (!isSaving) return;

    if (labelAnimPhase === 'bold') {
      if (labelBoldCount >= labelText.length) {
        setLabelAnimPhase('unbold');
        setLabelBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setLabelBoldCount(c => c + 1);
      }, 83);
      return () => clearTimeout(timer);
    }

    if (labelAnimPhase === 'unbold') {
      if (labelBoldCount >= labelText.length) {
        setLabelAnimPhase('bold');
        setLabelBoldCount(0);
        return;
      }
      const timer = setTimeout(() => {
        setLabelBoldCount(c => c + 1);
      }, 83);
      return () => clearTimeout(timer);
    }
  }, [isSaving, labelBoldCount, labelAnimPhase]);

  // Reset label animation when saving starts
  useEffect(() => {
    if (isSaving) {
      setLabelBoldCount(0);
      setLabelAnimPhase('bold');
    }
  }, [isSaving]);

  // Sync step state with hasPassword prop changes
  useEffect(() => {
    if (!isSaving) {
      setStep(hasPassword ? 'old' : 'set');
    }
  }, [hasPassword, isSaving]);

  // Animate placeholder on mount and when step changes
  useEffect(() => {
    if (!isSaving) {
      startPlaceholderAnimation(getPlaceholder());
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps


  const flashGreen = (onComplete: () => void) => {
    setFlashState('green');
    setTimeout(() => {
      setFlashState('none');
      onComplete();
    }, 600);
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

  const showAnimatedPlaceholder = !input && !isSaving && !isFocused;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    switch (step) {
      case 'old':
        const isValid = await verifyPassword(input.trim());
        if (isValid) {
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
          startPlaceholderAnimation('one more time');
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

  return (
    <div className="space-y-2">
      <style>
        {`
          .password-input::placeholder {
            color: ${isSaving ? '#00ff00' : textColor};
            opacity: 0.9;
          }
        `}
      </style>
      <div className="text-xs font-mono select-none" style={{ color: getColor() }}>
        {isSaving ? (
          labelAnimPhase === 'bold' ? (
            <>
              <span className="font-bold">{labelText.slice(0, labelBoldCount)}</span>
              <span>{labelText.slice(labelBoldCount)}</span>
            </>
          ) : (
            <>
              <span>{labelText.slice(0, labelBoldCount)}</span>
              <span className="font-bold">{labelText.slice(labelBoldCount)}</span>
            </>
          )
        ) : (
          <span className="font-bold">{getLabel()}</span>
        )}
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
            onBlur={() => {
              setIsFocused(false);
              if (!input) {
                startPlaceholderAnimation(getPlaceholder());
              }
            }}
            onMouseEnter={() => !isSaving && setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
            onMouseDown={() => !isSaving && setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            placeholder=""
            disabled={isSaving || flashState === 'green'}
            className="password-input w-full px-3 py-2 text-xs font-mono font-bold rounded"
            style={{
              backgroundColor: getBackgroundColor(),
              border: `3px solid ${getBorderColor()}`,
              color: getBorderColor(),
              caretColor: textColor,
              outline: 'none',
              cursor: isSaving ? 'not-allowed' : 'text',
            }}
          />
          {isSaving && (
            <div
              className="absolute top-1/2 -translate-y-1/2 text-xs font-mono font-bold pointer-events-none select-none"
              style={{ color: '#00ff00', left: '14px' }}
            >
              password saved
            </div>
          )}
          {showAnimatedPlaceholder && (
            <div
              className="absolute top-1/2 -translate-y-1/2 text-xs font-mono pointer-events-none select-none"
              style={{ color: getColor(), opacity: 0.9, left: '14px' }}
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

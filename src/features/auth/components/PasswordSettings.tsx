import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@features/theme';
import { scrambleText } from '@shared/utils/scramble';
import { getStatusColors } from '@shared/utils/confirmColor';

type PasswordStep = 'old' | 'new' | 'confirm' | 'set' | 'set-confirm';
type FlashState = 'none' | 'green' | 'red';

interface PasswordSettingsProps {
  hasPassword: boolean;
  verifyPassword: (password: string) => Promise<boolean>;
  setPassword: (password: string) => Promise<boolean>;
  changePassword: (password: string) => Promise<boolean>;
  removePassword: () => void;
  superscramble?: boolean;
  scrambleSeed?: number;
}

// Get placeholder text for each step
function getPlaceholderText(step: PasswordStep): string {
  switch (step) {
    case 'old': return 'old password';
    case 'new': return 'new password';
    case 'confirm': return 'new password again';
    case 'set': return 'set password';
    case 'set-confirm': return 'one more time';
  }
}

// Split button component (like TimeButton)
function PasswordButton({
  onClick,
  isSelected,
  children,
  position
}: {
  onClick: () => void;
  isSelected: boolean;
  children: React.ReactNode;
  position: 'left' | 'right';
}) {
  const { getColor } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const textColor = getColor();
  const borderColor = 'hsla(var(--h), var(--s), var(--l), 0.6)';
  const activeColor = 'hsl(var(--h), var(--s), max(0%, calc(var(--l) * 0.65)))';
  const hoverBg = 'hsla(var(--h), var(--s), 50%, 0.2)';

  const getCurrentBorder = () => {
    if (isClicked) return activeColor;
    if (isHovered || isSelected) return textColor;
    return borderColor;
  };

  const currentBorder = getCurrentBorder();

  const getBackground = () => {
    if (isSelected || isHovered) return hoverBg;
    return 'transparent';
  };

  const borderStyle = position === 'left'
    ? { borderTop: `3px solid ${currentBorder}`, borderBottom: `3px solid ${currentBorder}`, borderLeft: `3px solid ${currentBorder}`, borderRight: `1px solid ${currentBorder}` }
    : { borderTop: `3px solid ${currentBorder}`, borderBottom: `3px solid ${currentBorder}`, borderRight: `3px solid ${currentBorder}`, borderLeft: `1px solid ${currentBorder}` };

  return (
    <button
      onClick={onClick}
      tabIndex={-1}
      className={`flex-1 px-3 py-2 text-xs font-mono font-bold outline-none focus:outline-none select-none ${position === 'left' ? 'rounded-l' : 'rounded-r'}`}
      style={{
        color: textColor,
        backgroundColor: getBackground(),
        ...borderStyle,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsClicked(false); }}
      onMouseDown={() => setIsClicked(true)}
      onMouseUp={() => setIsClicked(false)}
    >
      {children}
    </button>
  );
}

export function PasswordSettings({ hasPassword, verifyPassword, setPassword, changePassword, removePassword, superscramble, scrambleSeed }: PasswordSettingsProps) {
  // Suppress unused variable warning - scrambleSeed triggers re-renders
  void scrambleSeed;

  // Helper to scramble text in superscramble
  const s = (text: string) => superscramble ? scrambleText(text) : text;

  const { getColor, hue, saturation, lightness, bgHue, bgSaturation, bgLightness } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);

  // Core state
  const [step, setStep] = useState<PasswordStep>(hasPassword ? 'old' : 'set');
  const [input, setInput] = useState('');
  const [newPasswordTemp, setNewPasswordTemp] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [flashState, setFlashState] = useState<FlashState>('none');

  // Controls whether to show the input (when hasPassword, starts hidden until user clicks "change password")
  const [showInput, setShowInput] = useState(!hasPassword);

  // Input interaction state
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Placeholder animation state
  const [boldCount, setBoldCount] = useState(0);
  const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');

  // Saved message animation state
  const [savedBoldCount, setSavedBoldCount] = useState(0);
  const [savedAnimPhase, setSavedAnimPhase] = useState<'bold' | 'unbold'>('bold');
  const savedText = 'saved. hold esc to lock.';

  // Derived state
  const placeholderText = getPlaceholderText(step);
  const showPlaceholder = !input && !isSaving;
  const isDisabled = isSaving || flashState === 'green';

  // Sync step and showInput with hasPassword prop
  useEffect(() => {
    if (!isSaving) {
      setStep(hasPassword ? 'old' : 'set');
      // When password is removed, show input for "set password" flow
      // When password exists, hide input until user clicks "change password"
      setShowInput(!hasPassword);
    }
  }, [hasPassword, isSaving]);

  // NOTE: We intentionally do NOT auto-focus when showInput becomes true on mount.
  // When settings opens (no password set), typing should go to the editor, not the password input.
  // The user must click the input to start the password flow.
  // Auto-focus DOES happen:
  // 1. After clicking "change password" button (explicit in handleChangePasswordClick)
  // 2. After step transitions within a flow (explicit in flashGreen with refocusAfter=true)
  // 3. After error flash (explicit requestAnimationFrame calls)

  // Window-level ESC handler to reset password flow (without requiring input focus)
  // Always attached to avoid race conditions, but checks state inside handler
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      // Don't handle if input not shown or saving (let App.tsx lock when saving)
      if (!showInput || isSaving) return;

      // Check each case and only preventDefault when we actually handle it
      if (step === 'set-confirm') {
        e.preventDefault();
        setStep('set');
        setInput('');
        setNewPasswordTemp('');
      } else if (step === 'new' || step === 'confirm') {
        e.preventDefault();
        setStep('old');
        setInput('');
        setNewPasswordTemp('');
      } else if (step === 'old' && hasPassword) {
        e.preventDefault();
        setShowInput(false);
        setInput('');
      } else if (step === 'set' && !hasPassword) {
        if (input) {
          // Has content: clear it, keep focus
          e.preventDefault();
          setInput('');
        } else if (document.activeElement === inputRef.current) {
          // Empty and focused: blur to defocus, next ESC will cycle
          e.preventDefault();
          inputRef.current?.blur();
        }
        // Otherwise let ESC through to lock the app
      }
    };

    // Use capture phase so this runs BEFORE App.tsx's handler
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [showInput, isSaving, step, hasPassword, input]);

  // Placeholder animation - runs when placeholder is visible (disabled in superscramble)
  useEffect(() => {
    if (superscramble) return; // Disable animation in superscramble
    if (!showPlaceholder || !showInput) return;

    const maxCount = placeholderText.length;
    if (boldCount >= maxCount) {
      setAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [showPlaceholder, showInput, boldCount, animPhase, placeholderText.length, superscramble]);

  // Reset placeholder animation when it becomes visible
  useEffect(() => {
    if (superscramble) return; // Disable animation in superscramble
    if (showPlaceholder && showInput) {
      setBoldCount(0);
      setAnimPhase('bold');
    }
  }, [showPlaceholder, showInput, superscramble]);

  // Saved message animation - runs when saving (disabled in superscramble)
  useEffect(() => {
    if (superscramble) return; // Disable animation in superscramble
    if (!isSaving) return;

    const maxCount = savedText.length;
    if (savedBoldCount >= maxCount) {
      setSavedAnimPhase(prev => prev === 'bold' ? 'unbold' : 'bold');
      setSavedBoldCount(0);
      return;
    }

    const timer = setTimeout(() => setSavedBoldCount(c => c + 1), 83);
    return () => clearTimeout(timer);
  }, [isSaving, savedBoldCount, savedAnimPhase, superscramble]);

  // Reset saved animation when saving starts
  useEffect(() => {
    if (superscramble) return; // Disable animation in superscramble
    if (isSaving) {
      setSavedBoldCount(0);
      setSavedAnimPhase('bold');
    }
  }, [isSaving, superscramble]);

  // Keypress anywhere to dismiss "password saved" and return to split buttons
  // (clicks are intentional actions, so only dismiss on keystroke)
  useEffect(() => {
    if (!isSaving) return;

    const dismiss = (e: KeyboardEvent) => {
      // Don't dismiss on Cmd+Z / Ctrl+Z — that's for preset undo, not password interaction
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) return;
      setIsSaving(false);
      setShowInput(false);
    };

    // Use capture phase so this runs BEFORE any stopPropagation calls in buttons/pickers
    window.addEventListener('keydown', dismiss, true);

    return () => {
      window.removeEventListener('keydown', dismiss, true);
    };
  }, [isSaving]);

  // Click outside input to dismiss password flow (same as ESC)
  // Works for both "change password" and "set password" flows
  useEffect(() => {
    if (!showInput || isSaving) return;

    const handleClickOutside = (e: MouseEvent) => {
      // If click is on the input, ignore
      if (inputRef.current && inputRef.current.contains(e.target as Node)) return;

      if (hasPassword) {
        // "Change password" flow: reset to split buttons
        setShowInput(false);
        setInput('');
        setNewPasswordTemp('');
        setStep('old');
      } else {
        // "Set password" flow: reset and blur
        setStep('set');
        setInput('');
        setNewPasswordTemp('');
        inputRef.current?.blur();
      }
    };

    // Small delay to avoid button clicks from immediately dismissing
    // Use capture phase so this runs BEFORE stopPropagation in buttons
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClickOutside, true);
    };
  }, [hasPassword, showInput, isSaving]);

  // Flash helpers
  const flashGreen = (onComplete: () => void, refocusAfter: boolean = false) => {
    setFlashState('green');
    setIsFocused(false); // Reset focus since input gets disabled
    setTimeout(() => {
      setFlashState('none');
      onComplete();
      // If refocusing, wait for React to commit DOM changes (input re-enabled)
      if (refocusAfter) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
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
  const dividerColor = 'hsla(var(--h), var(--s), var(--l), 0.6)';
  const activeColor = 'hsl(var(--h), var(--s), max(0%, calc(var(--l) * 0.65)))';
  const hoverBg = 'hsla(var(--h), var(--s), 50%, 0.2)';
  // Dynamic status colors using WCAG contrast ratios
  const { confirm: confirmColor, error: errorColor } = useMemo(
    () => getStatusColors(hue, saturation, lightness, bgHue, bgSaturation, bgLightness),
    [hue, saturation, lightness, bgHue, bgSaturation, bgLightness]
  );

  const getBorderColor = () => {
    if (flashState === 'green' || isSaving) return confirmColor;
    if (flashState === 'red') return errorColor;
    if (isPressed) return activeColor;
    if (isFocused || isHovered || input) return textColor;
    return dividerColor;
  };

  const getBackgroundColor = () => {
    if (isHovered || isFocused) return hoverBg;
    return 'transparent';
  };

  // Handle "change password" button click
  const handleChangePasswordClick = () => {
    setShowInput(true);
    setStep('old');
    setInput('');
    setNewPasswordTemp('');
    // Auto-focus input after React commits DOM changes
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Handle "remove password" button click
  const handleRemovePasswordClick = () => {
    removePassword();
    // Clear any leftover input text so "set password" placeholder shows clean
    setInput('');
    setNewPasswordTemp('');
    // hasPassword will become false, useEffect will set showInput to true and step to 'set'
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
          }, true); // refocus after flash
        } else {
          flashRed();
          setInput('');
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        break;
      }

      case 'new':
        flashGreen(() => {
          setNewPasswordTemp(input.trim());
          setStep('confirm');
          setInput('');
        }, true); // refocus after flash
        break;

      case 'confirm':
        if (input.trim() === newPasswordTemp) {
          await changePassword(newPasswordTemp);
          setInput('');
          setNewPasswordTemp('');
          setIsSaving(true);
        } else {
          flashRed();
          setStep('old');
          setInput('');
          setNewPasswordTemp('');
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        break;

      case 'set':
        flashGreen(() => {
          setNewPasswordTemp(input.trim());
          setStep('set-confirm');
          setInput('');
        }, true); // refocus after flash
        break;

      case 'set-confirm':
        if (input.trim() === newPasswordTemp) {
          setInput('');
          setNewPasswordTemp('');
          setIsSaving(true); // Set BEFORE setPassword so the useEffect guard prevents reset
          await setPassword(newPasswordTemp);
        } else {
          flashRed();
          setStep('set');
          setInput('');
          setNewPasswordTemp('');
          requestAnimationFrame(() => inputRef.current?.focus());
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

  // When hasPassword and input not shown yet, display split button
  if (hasPassword && !showInput && !isSaving) {
    return (
      <div className="flex justify-center overflow-hidden">
        <div className="flex w-full min-w-max">
          <PasswordButton
            onClick={handleChangePasswordClick}
            isSelected={false}
            position="left"
          >
            {s('change password')}
          </PasswordButton>
          <PasswordButton
            onClick={handleRemovePasswordClick}
            isSelected={false}
            position="right"
          >
            {s('remove password')}
          </PasswordButton>
        </div>
      </div>
    );
  }

  // Show input flow (either "set password" or "change password")
  return (
    <div className="space-y-2">
      {/* Input */}
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            ref={inputRef}
            tabIndex={-1}
            type={isSaving ? 'text' : 'password'}
            value={isSaving ? '' : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Block Cmd+Z / Ctrl+Z in password inputs — undo is not appropriate for password fields
              if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
              }
            }}
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
            }}
          />

          {/* Saved message (dismiss with keystroke only, not click) */}
          {isSaving && (
            <div className="absolute inset-0 flex items-center">
              <span className="ml-3.5 text-xs font-mono select-none" style={{ color: confirmColor }}>
                {superscramble ? <span className="font-bold">{s(savedText)}</span> : renderAnimatedText(savedText, savedBoldCount, savedAnimPhase)}
              </span>
            </div>
          )}

          {/* Animated placeholder */}
          {showPlaceholder && (
            <div
              className="absolute top-1/2 -translate-y-1/2 left-3.5 text-xs font-mono pointer-events-none select-none"
              style={{ color: textColor, opacity: 0.85 }}
            >
              {superscramble ? <span className="font-bold">{s(placeholderText)}</span> : renderAnimatedText(placeholderText, boldCount, animPhase)}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

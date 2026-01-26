import { useState } from 'react';
import { useTheme } from '@features/theme';

interface LockScreenProps {
  passwordInput: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => boolean;
}

export function LockScreen({ passwordInput, onPasswordChange, onSubmit }: LockScreenProps) {
  const { getColor, getBgColor } = useTheme();
  const [flashState, setFlashState] = useState<'none' | 'red'>('none');

  const flashRed = () => {
    setFlashState('red');
    setTimeout(() => setFlashState('none'), 80);
    setTimeout(() => setFlashState('red'), 160);
    setTimeout(() => setFlashState('none'), 240);
    setTimeout(() => setFlashState('red'), 320);
    setTimeout(() => setFlashState('none'), 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    const success = onSubmit(e);
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
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="font-mono font-bold px-4 py-2 rounded"
          style={{
            backgroundColor: getBgColor(),
            border: `3px solid ${getInputColor()}`,
            color: getInputColor(),
            caretColor: getInputColor(),
            outline: 'none',
          }}
          autoFocus
        />
      </form>
    </div>
  );
}

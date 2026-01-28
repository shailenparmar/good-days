import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Check mobile FIRST, before loading heavy imports
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Simple mobile component with rand button
function MobileScreen() {
  const [colors, setColors] = useState({
    hue: 144, sat: 36, light: 43,
    bgHue: 84, bgSat: 100, bgLight: 94
  });
  const [pulseKey, setPulseKey] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);

  const randomize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lightBg = Math.random() > 0.5;
    setColors({
      hue: Math.floor(Math.random() * 360),
      sat: 30 + Math.floor(Math.random() * 70),
      light: lightBg ? 25 + Math.floor(Math.random() * 30) : 70 + Math.floor(Math.random() * 25),
      bgHue: Math.floor(Math.random() * 360),
      bgSat: 50 + Math.floor(Math.random() * 50),
      bgLight: lightBg ? 80 + Math.floor(Math.random() * 18) : 5 + Math.floor(Math.random() * 15),
    });
    setPulseKey(k => k + 1); // Reset animation
    setIsPulsing(true);
  };

  const stopPulsing = () => setIsPulsing(false);

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;
  const words = ['good', 'days', 'is', 'not', 'supported', 'on', 'mobile', 'yet'];

  return (
    <div
      onClick={stopPulsing}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '32px',
        backgroundColor: bgColor,
      }}
    >
      <style>{`
        @keyframes mobile-pulse {
          0% { box-shadow: inset 0 0 0 8px ${textColor}; }
          50% { box-shadow: inset 0 0 0 4px ${textColor}; }
          100% { box-shadow: inset 0 0 0 8px ${textColor}; }
        }
        .mobile-rand-pulse {
          animation: mobile-pulse 1s steps(12) infinite;
        }
      `}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {words.map((word, i) => (
          <p key={i} style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>{word}</p>
        ))}
      </div>
      <button
        key={pulseKey}
        onClick={randomize}
        className={isPulsing ? 'mobile-rand-pulse' : ''}
        style={{
          marginBottom: '48px',
          padding: '8px 40px',
          fontFamily: 'monospace',
          fontWeight: 800,
          fontSize: '1.5rem',
          backgroundColor: 'transparent',
          border: `8px solid ${textColor}`,
          borderRadius: '12px',
          color: textColor,
          cursor: 'pointer',
        }}
      >
        rand
      </button>
    </div>
  );
}

if (isMobile) {
  createRoot(document.getElementById('root')!).render(<MobileScreen />);
} else {
  // Load full app only on desktop
  import('./App.tsx').then(({ default: App }) => {
    import('@shared/storage').then(({ initStorage, isElectron }) => {
      const startApp = async () => {
        // Only init storage for Electron (file system); browser uses localStorage directly
        if (isElectron()) {
          await initStorage();
        }
        createRoot(document.getElementById('root')!).render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
      };
      startApp();
    });
  });
}

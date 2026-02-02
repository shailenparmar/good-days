import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Check mobile FIRST, before loading heavy imports
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Convert HSL to hex for theme-color (Safari prefers hex)
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Parse color values from pasted text (same format as powerstat)
function parseColorInput(input: string) {
  const trimmed = input.trim().toLowerCase();

  // Try HEX format: #rrggbb
  const hexMatch = trimmed.match(/#([0-9a-f]{6})/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { type: 'hsl' as const, h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  // Try HSL format: "txt: 120, 50%, 60%" or "bg: 200, 80%, 90%" or just "120, 50%, 60%"
  const hslMatch = trimmed.match(/(?:(txt|bg):\s*)?(\d+),\s*(\d+)%?,\s*(\d+)%?/);
  if (hslMatch) {
    const type = hslMatch[1] as 'txt' | 'bg' | undefined;
    return { type: type || 'hsl' as const, h: parseInt(hslMatch[2]), s: parseInt(hslMatch[3]), l: parseInt(hslMatch[4]) };
  }

  return null;
}

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
    // Haptic feedback on supported devices
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
    setColors({
      hue: Math.floor(Math.random() * 360),
      sat: Math.floor(Math.random() * 101),
      light: Math.floor(Math.random() * 101),
      bgHue: Math.floor(Math.random() * 360),
      bgSat: Math.floor(Math.random() * 101),
      bgLight: Math.floor(Math.random() * 101),
    });
    setPulseKey(k => k + 1); // Reset animation
    setIsPulsing(true);
  };

  const stopPulsing = () => setIsPulsing(false);

  const handlePaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.vibrate) navigator.vibrate(10);
    try {
      const text = await navigator.clipboard.readText();
      let txtH = colors.hue, txtS = colors.sat, txtL = colors.light;
      let bgH = colors.bgHue, bgS = colors.bgSat, bgL = colors.bgLight;
      let foundAny = false;

      const lines = text.split('\n');
      for (const line of lines) {
        const parsed = parseColorInput(line);
        if (parsed) {
          foundAny = true;
          if (parsed.type === 'txt') {
            txtH = parsed.h; txtS = parsed.s; txtL = parsed.l;
          } else if (parsed.type === 'bg') {
            bgH = parsed.h; bgS = parsed.s; bgL = parsed.l;
          } else {
            // Plain HSL - apply to text by default
            txtH = parsed.h; txtS = parsed.s; txtL = parsed.l;
          }
        }
      }

      if (foundAny) {
        setColors({ hue: txtH, sat: txtS, light: txtL, bgHue: bgH, bgSat: bgS, bgLight: bgL });
        setPulseKey(k => k + 1);
        setIsPulsing(true);
      }
    } catch {
      // Clipboard access denied or empty
    }
  };

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;
  const words = ['good', 'days', 'is', 'not', 'supported', 'on', 'mobile', 'yet'];

  // Update theme-color meta tag and body background to match
  useEffect(() => {
    try {
      const hexColor = hslToHex(colors.bgHue, colors.bgSat, colors.bgLight);

      // Remove ALL theme-color meta tags and re-add
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
      const newMeta = document.createElement('meta');
      newMeta.id = 'theme-color-meta';
      newMeta.name = 'theme-color';
      newMeta.content = hexColor;
      document.head.appendChild(newMeta);

      // Update body/html backgrounds with !important
      document.body.style.setProperty('background-color', bgColor, 'important');
      document.documentElement.style.setProperty('background-color', bgColor, 'important');

      // Force Safari repaint by triggering a minimal scroll
      window.scrollTo(0, window.scrollY === 0 ? 1 : 0);
      setTimeout(() => window.scrollTo(0, 0), 10);
    } catch (e) {
      // Ignore errors
    }
  }, [bgColor, colors.bgHue, colors.bgSat, colors.bgLight]);

  return (
    <div
      onClick={stopPulsing}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: bgColor,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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
      <div style={{ marginTop: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {words.map((word, i) => (
          <p key={i} style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>{word}</p>
        ))}
      </div>

      <button
        key={`rand-${pulseKey}`}
        onClick={randomize}
        className={isPulsing ? 'mobile-rand-pulse' : ''}
        style={{
          marginTop: '60px',
          padding: '8px 40px',
          fontFamily: 'monospace',
          fontWeight: 800,
          fontSize: '1.5rem',
          backgroundColor: 'transparent',
          border: `8px solid ${textColor}`,
          borderRadius: '12px',
          color: textColor,
        }}
      >
        rand
      </button>

      <button
        key={`paste-${pulseKey}`}
        onClick={handlePaste}
        className={isPulsing ? 'mobile-rand-pulse' : ''}
        style={{
          marginTop: '16px',
          marginBottom: '48px',
          padding: '8px 40px',
          fontFamily: 'monospace',
          fontWeight: 800,
          fontSize: '1.5rem',
          backgroundColor: 'transparent',
          border: `8px solid ${textColor}`,
          borderRadius: '12px',
          color: textColor,
        }}
      >
        paste
      </button>
    </div>
  );
}

if (isMobile) {
  createRoot(document.getElementById('root')!).render(<MobileScreen />);
} else {
  // Load full app only on desktop
  import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}

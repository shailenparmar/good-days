import { useState, useEffect, useRef } from 'react';
import { Settings, Heart, Eye, EyeOff } from 'lucide-react';

// Feature imports
import { ThemeProvider, useTheme } from '@features/theme';
import { useAuth, LockScreen } from '@features/auth';
import { useJournalEntries, JournalEditor, EntrySidebar, EntryHeader, EntryFooter } from '@features/journal';
import { useStatistics, StatsDisplay } from '@features/statistics';
import { SettingsPanel, AboutPanel } from '@features/settings';

// Shared imports
import { getItem, setItem } from '@shared/storage';
import { getTodayDate } from '@shared/utils/date';
import { FunctionButton, ErrorBoundary } from '@shared/components';

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Generate truly random theme colors (same as full app)
function generateRandomColors() {
  const hue = Math.floor(Math.random() * 360);
  const sat = Math.floor(Math.random() * 101);
  const light = Math.floor(Math.random() * 101);
  const bgHue = Math.floor(Math.random() * 360);
  const bgSat = Math.floor(Math.random() * 101);
  const bgLight = Math.floor(Math.random() * 101);
  return { hue, sat, light, bgHue, bgSat, bgLight };
}

function MobileNotSupported() {
  const [colors, setColors] = useState(() => generateRandomColors());
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const words = ['good', 'days', 'is', 'not', 'supported', 'on', 'mobile', 'yet'];

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  const handleRand = () => {
    setColors(generateRandomColors());
    setIsActive(true);
  };

  const borderDefault = `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.6)`;
  const borderHover = textColor;
  const borderActive = `hsl(${colors.hue}, ${colors.sat}%, ${Math.max(0, colors.light * 0.65)}%)`;
  const hoverBg = `hsla(${colors.hue}, ${colors.sat}%, 50%, 0.2)`;

  const getBorderColor = () => {
    if (isPressed) return borderActive;
    if (isHovered || isActive) return borderHover;
    return borderDefault;
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-screen p-8"
      style={{ backgroundColor: bgColor }}
    >
      <style>
        {`
          @keyframes preset-flicker-mobile {
            0% { box-shadow: 0 0 0 6px ${getBorderColor()}; }
            50% { box-shadow: 0 0 0 0px ${getBorderColor()}; }
            100% { box-shadow: 0 0 0 6px ${getBorderColor()}; }
          }
          .preset-pulse-mobile {
            animation: preset-flicker-mobile 1s steps(12) infinite;
          }
        `}
      </style>

      <div className="flex-1 flex flex-col items-center justify-center">
        {words.map((word, i) => (
          <p
            key={i}
            className="font-mono font-bold text-lg select-none"
            style={{ color: textColor }}
          >
            {word}
          </p>
        ))}
      </div>

      <button
        onClick={handleRand}
        onTouchStart={() => setIsPressed(true)}
        onTouchEnd={() => setIsPressed(false)}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
        className={`mb-12 px-10 py-5 font-mono font-extrabold select-none flex items-center justify-center ${isActive ? 'preset-pulse-mobile' : ''}`}
        style={{
          fontSize: '1.5rem',
          backgroundColor: isHovered || isActive ? hoverBg : 'transparent',
          border: `6px solid ${getBorderColor()}`,
          borderRadius: '12px',
          color: textColor,
          outline: 'none',
        }}
      >
        rand
      </button>
    </div>
  );
}

function AppContent() {
  const editorRef = useRef<HTMLDivElement>(null);
  const unscrambledContent = useRef<string>('');

  // Feature hooks
  const theme = useTheme();
  const auth = useAuth();
  const journal = useJournalEntries();
  const stats = useStatistics();

  // Local state
  const [showDebugMenu, setShowDebugMenu] = useState(false);
  const [showAboutPanel, setShowAboutPanel] = useState(false);
  const [isScrambled, setIsScrambled] = useState(() => {
    return getItem('isScrambled') === 'true';
  });

  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness, trackCurrentColorway } = theme;

  // Save scramble state to localStorage
  useEffect(() => {
    setItem('isScrambled', String(isScrambled));
  }, [isScrambled]);

  // Track colorway when settings closes (for slider changes)
  const prevShowDebugMenu = useRef(showDebugMenu);
  useEffect(() => {
    if (prevShowDebugMenu.current && !showDebugMenu) {
      // Settings just closed, track the current colorway
      trackCurrentColorway();
    }
    prevShowDebugMenu.current = showDebugMenu;
  }, [showDebugMenu, trackCurrentColorway]);

  // ESC key to lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !auth.isLocked) {
        if (editorRef.current) {
          journal.saveEntry(editorRef.current.innerHTML || '', Date.now());
        }
        auth.lock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [auth, journal]);

  // Note: Scramble/unscramble handling is done in JournalEditor

  // Clear unscrambled backup and turn off scramble when changing dates (not on initial load)
  const previousSelectedDate = useRef<string>(journal.selectedDate);
  useEffect(() => {
    if (previousSelectedDate.current !== journal.selectedDate) {
      unscrambledContent.current = '';
      setIsScrambled(false);
      previousSelectedDate.current = journal.selectedDate;
    }
  }, [journal.selectedDate]);

  // Automatic midnight detection
  useEffect(() => {
    const scheduleNextMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      return setTimeout(() => {
        // Save current content
        if (editorRef.current) {
          const content = editorRef.current.innerHTML || '';
          const textContent = editorRef.current.textContent || '';
          if (textContent.trim()) {
            journal.saveEntry(content, Date.now());
          }
        }
        // Switch to new day
        journal.setSelectedDate(getTodayDate());
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
        }
        scheduleNextMidnight();
      }, msUntilMidnight);
    };

    const timeoutId = scheduleNextMidnight();
    return () => clearTimeout(timeoutId);
  }, [journal]);

  // Handle password unlock
  const handlePasswordSubmit = async (e: React.FormEvent): Promise<boolean> => {
    const success = await auth.handlePasswordSubmit(e);
    if (success) {
      journal.reloadEntries();
      if (editorRef.current) {
        const entry = journal.entries.find(e => e.date === journal.selectedDate);
        editorRef.current.innerHTML = entry?.content || '';
      }
    }
    return success;
  };

  // Handle input with keystroke tracking
  const handleInput = (content: string) => {
    stats.incrementKeystrokes();
    journal.setCurrentContent(editorRef.current?.textContent || '');
    journal.saveEntry(content, Date.now());
  };

  // Lock screen (only show if password is set)
  if (auth.isLocked && auth.hasPassword) {
    return (
      <LockScreen
        passwordInput={auth.passwordInput}
        onPasswordChange={auth.setPasswordInput}
        onSubmit={handlePasswordSubmit}
      />
    );
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}>
      {/* Global styles */}
      <style>
        {`
          @keyframes preset-flicker {
            0% { border-width: 5px; }
            50% { border-width: 3px; }
            100% { border-width: 5px; }
          }
          .preset-pulse {
            animation: preset-flicker 1s steps(12) infinite;
          }
          input::placeholder {
            color: ${getColor().replace('hsl', 'hsla').replace(')', ', 0.4)')};
            opacity: 1;
          }
        `}
      </style>

      {/* Sidebar */}
      <div
        className="w-80 flex flex-col min-h-screen"
        style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
        }}
        onClick={() => { setShowDebugMenu(false); setShowAboutPanel(false); }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10"
          style={{
            backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
            borderBottom: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
          }}
        >
          <div className="p-4">
            <h1 className="text-2xl font-extrabold font-mono tracking-tight text-center select-none" style={{ color: getColor() }}>
              good days
            </h1>
          </div>

          {/* Stats */}
          <div
            className="p-4"
            style={{ borderTop: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
          >
            <StatsDisplay
              entries={journal.entries}
              totalKeystrokes={stats.totalKeystrokes}
              totalSecondsOnApp={stats.totalSecondsOnApp}
            />
          </div>
        </div>

        {/* Entries list */}
        <div
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`, scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
          <EntrySidebar
            entries={journal.entries}
            selectedDate={journal.selectedDate}
            onSelectDate={(date) => {
              journal.setSelectedDate(date);
              setShowDebugMenu(false);
            }}
            onSaveTitle={journal.saveTitle}
            settingsOpen={showDebugMenu}
          />
        </div>

        {/* Bottom buttons */}
        <div
          className="p-4 space-y-2"
          style={{
            backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
            borderTop: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
          }}
        >
          <FunctionButton onClick={() => setIsScrambled(!isScrambled)} isActive={isScrambled}>
            {isScrambled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>{isScrambled ? 'unscramble' : 'scramble'}</span>
          </FunctionButton>

          <FunctionButton onClick={() => setShowDebugMenu(!showDebugMenu)} isActive={showDebugMenu} dataAttribute="settings-toggle">
            <Settings className="w-3 h-3" />
            <span>settings</span>
          </FunctionButton>

          <FunctionButton onClick={() => setShowAboutPanel(!showAboutPanel)} isActive={showAboutPanel} dataAttribute="about-toggle">
            <Heart className="w-3 h-3" />
            <span>about</span>
          </FunctionButton>
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        showDebugMenu={showDebugMenu}
        hasPassword={auth.hasPassword}
        verifyPassword={auth.verifyPassword}
        setPassword={auth.setPassword}
        entries={journal.entries}
        onCloseAbout={() => setShowAboutPanel(false)}
      />

      {/* About Panel */}
      <AboutPanel isOpen={showAboutPanel} onCloseSettings={() => setShowDebugMenu(false)} />

      {/* Main Editor Area */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}
        onClick={() => { setShowDebugMenu(false); setShowAboutPanel(false); }}
      >
        <EntryHeader selectedDate={journal.selectedDate} entries={journal.entries} paddingBottom={20} />

        <JournalEditor
          entries={journal.entries}
          selectedDate={journal.selectedDate}
          currentContent={journal.currentContent}
          isScrambled={isScrambled}
          onInput={handleInput}
          onSave={journal.saveEntry}
          editorRef={editorRef}
          unscrambledContentRef={unscrambledContent}
        />

        <EntryFooter currentContent={journal.currentContent} />
      </div>
    </div>
  );
}

function App() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobile());
    const handleResize = () => setMobile(isMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (mobile) {
    return <MobileNotSupported />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

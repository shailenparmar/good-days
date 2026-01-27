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

// Generate random theme colors with guaranteed contrast
function generateRandomColors() {
  const hue = Math.floor(Math.random() * 360);
  const sat = 30 + Math.floor(Math.random() * 70); // 30-100%
  const bgHue = Math.floor(Math.random() * 360);
  const bgSat = 50 + Math.floor(Math.random() * 50); // 50-100%

  // Ensure contrast: either light bg + dark text, or dark bg + light text
  const lightBg = Math.random() > 0.5;
  const bgLight = lightBg ? 75 + Math.floor(Math.random() * 23) : 5 + Math.floor(Math.random() * 20); // 75-97% or 5-25%
  const light = lightBg ? 20 + Math.floor(Math.random() * 35) : 70 + Math.floor(Math.random() * 28); // 20-55% or 70-98%

  return { hue, sat, light, bgHue, bgSat, bgLight };
}

function MobileNotSupported() {
  const [colors, setColors] = useState(() => generateRandomColors());

  const words = ['good', 'days', 'is', 'not', 'supported', 'on', 'mobile', 'yet'];

  const textColor = `hsl(${colors.hue}, ${colors.sat}%, ${colors.light}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;
  const borderColor = `hsla(${colors.hue}, ${colors.sat}%, ${colors.light}%, 0.6)`;

  const handleRand = () => {
    setColors(generateRandomColors());
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-screen p-8"
      style={{ backgroundColor: bgColor }}
    >
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
        className="mb-12 px-10 py-5 font-mono font-extrabold select-none flex items-center justify-center"
        style={{
          fontSize: '1.5rem',
          backgroundColor: 'transparent',
          border: `6px solid ${borderColor}`,
          borderRadius: '20px',
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
  const [mobile, setMobile] = useState(() => isMobile());

  useEffect(() => {
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

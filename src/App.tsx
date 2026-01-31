import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Heart, Eye, EyeOff } from 'lucide-react';

// Feature imports
import { ThemeProvider, useTheme } from '@features/theme';
import { useAuth, LockScreen } from '@features/auth';
import { useJournalEntries, JournalEditor, EntrySidebar, EntryHeader, EntryFooter, htmlToText } from '@features/journal';
import { useStatistics, StatsDisplay } from '@features/statistics';
import { SettingsPanel, AboutPanel } from '@features/settings';

// Shared imports
import { getItem, setItem } from '@shared/storage';
import { scrambleText, setScrambleSeed as updateGlobalScrambleSeed } from '@shared/utils/scramble';
import { usePersisted } from '@shared/hooks';
import { getTodayDate } from '@shared/utils/date';
import { FunctionButton, ErrorBoundary } from '@shared/components';

const VERSION = '1.5.26';

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function MobileNotSupported() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '32px',
        backgroundColor: 'hsl(84, 100%, 94%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>good</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>days</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>is</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>not</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>supported</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>on</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>mobile</p>
        <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>yet</p>
      </div>
    </div>
  );
}

function AppContent() {
  const editorRef = useRef<HTMLDivElement>(null);

  // Feature hooks
  const theme = useTheme();
  const auth = useAuth();
  const journal = useJournalEntries();
  const stats = useStatistics();

  // Local state
  const [showDebugMenu, setShowDebugMenu] = useState(() => {
    return getItem('showSettings') === 'true';
  });
  const [showAboutPanel, setShowAboutPanel] = useState(() => {
    return getItem('showAbout') === 'true';
  });
  const [isScrambled, setIsScrambled] = useState(() => {
    return getItem('isScrambled') === 'true';
  });

  // Responsive sidebar - collapse when window is narrow
  const COLLAPSE_BREAKPOINT = 711;
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < COLLAPSE_BREAKPOINT);
  const [showSidebarInNarrow, setShowSidebarInNarrow] = useState(false);
  const [zenMode, setZenMode] = usePersisted('zenMode', false); // Full zen: just editor, hide everything
  const [minizen, setMinizen] = usePersisted('minizen', false); // Minizen: hide sidebar, keep header+footer (wide only)
  const [preZenState, setPreZenState] = useState<{ minizen: boolean; showSidebarInNarrow: boolean } | null>(null);
  const [entryHeaderHeight, setEntryHeaderHeight] = useState(0);
  const [editorKey, setEditorKey] = useState(0); // Increments to force editor remount after import

  // Exit zen mode and restore previous state
  const exitZen = useCallback(() => {
    setZenMode(false);
    if (preZenState) {
      setMinizen(preZenState.minizen);
      setShowSidebarInNarrow(preZenState.showSidebarInNarrow);
      setPreZenState(null);
    }
  }, [preZenState, setZenMode]);

  // Enter zen mode, saving current state
  const enterZen = useCallback(() => {
    setPreZenState({ minizen, showSidebarInNarrow });
    setZenMode(true);
  }, [minizen, showSidebarInNarrow, setZenMode]);

  // Centralized panel closing - used by multiple click handlers
  const closePanels = useCallback(() => {
    setShowDebugMenu(false);
    setShowAboutPanel(false);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth < COLLAPSE_BREAKPOINT;
      const wasNarrow = isNarrow;
      setIsNarrow(narrow);

      // Mode transition handling
      if (narrow !== wasNarrow) {
        if (narrow && !wasNarrow) {
          // Wide → Narrow: close panels (no room for them)
          closePanels();
        }
        // Both directions: reset sidebar states (but preserve zen!)
        setShowSidebarInNarrow(false);
        setMinizen(false);
        // zenMode is preserved - if in zen, stay in zen
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isNarrow, closePanels]);

  const { getColor, bgHue, bgSaturation, bgLightness, hue, saturation, lightness, trackCurrentColorway, randomizeTheme } = theme;

  // Supermode: scramble + settings + about all open = chaos mode
  const isSupermode = isScrambled && showDebugMenu && showAboutPanel;
  const [scrambleSeed, setScrambleSeed] = useState(0);

  // Sync global scramble seed for consistent rendering
  useEffect(() => {
    updateGlobalScrambleSeed(scrambleSeed);
  }, [scrambleSeed]);

  // Save panel states to localStorage
  useEffect(() => {
    setItem('showSettings', String(showDebugMenu));
  }, [showDebugMenu]);

  useEffect(() => {
    setItem('showAbout', String(showAboutPanel));
  }, [showAboutPanel]);

  // Save scramble state to localStorage
  useEffect(() => {
    setItem('isScrambled', String(isScrambled));
  }, [isScrambled]);


  // ESC key behavior (priority order):
  // 1. In zen mode: exit zen and restore previous state
  // 2. In minizen (wide): exit minizen (show sidebar)
  // 3. Otherwise: lock the app
  // DON'T act when:
  // - User is in an input field
  // - ESC was already handled by another component (via e.defaultPrevented)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !auth.isLocked) {
        // Don't act if ESC was already handled (e.g., by password settings)
        if (e.defaultPrevented) return;

        // Don't act if user is in an input field
        const activeEl = document.activeElement;
        const tagName = activeEl?.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') return;

        // In zen mode: exit zen and restore previous state
        if (zenMode) {
          exitZen();
          return;
        }

        // In minizen (wide only): exit minizen (show sidebar)
        if (!isNarrow && minizen) {
          setMinizen(false);
          return;
        }

        // Otherwise: save and lock
        if (editorRef.current) {
          journal.saveEntry(editorRef.current.innerHTML || '', Date.now());
        }
        auth.lock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [auth, journal, zenMode, exitZen, isNarrow, minizen]);

  // Auto-focus editor when typing anywhere (unless in another input)
  // Only works when viewing today's entry (past entries are read-only)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only allow typing into today's entry
      if (journal.selectedDate !== getTodayDate()) return;

      // Skip if already handled by another component (e.g., preset grid)
      if (e.defaultPrevented) return;

      // Skip if in input or textarea
      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return;

      // Skip if already in the editor (prevents cursor jumping to end while typing)
      if (editorRef.current?.contains(activeEl)) return;

      // Skip if in any other contenteditable (e.g., title)
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable) return;

      // Skip modifier keys
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // When settings open (but not powerstat mode), protect Space/Backspace for preset controls
      // Enter is always blocked when settings is open (even in powerstat mode)
      const isPowerstatMode = showDebugMenu && showAboutPanel;
      if (showDebugMenu && e.key === 'Enter') return;
      if (showDebugMenu && !isPowerstatMode && (e.key === ' ' || e.key === 'Backspace')) return;

      // Handle printable characters, Enter, and Backspace
      const isPrintable = e.key.length === 1;
      const isEnterOrBackspace = e.key === 'Enter' || e.key === 'Backspace';
      if (!isPrintable && !isEnterOrBackspace) return;

      // Close settings/about panels if open (narrow mode only - wide mode has space)
      if (isNarrow) closePanels();

      // Focus the editor and move cursor to end
      if (editorRef.current) {
        editorRef.current.focus();
        // Move cursor to end of content
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false); // false = collapse to end
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showDebugMenu, showAboutPanel, isNarrow, closePanels, journal.selectedDate]);

  // Note: Scramble/unscramble handling is done in JournalEditor

  // Turn off scramble when changing dates
  const previousSelectedDate = useRef<string>(journal.selectedDate);
  useEffect(() => {
    if (previousSelectedDate.current !== journal.selectedDate) {
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
    trackCurrentColorway(); // Track colorway on actual typing (not slider exploration)
    journal.setCurrentContent(htmlToText(content));
    journal.saveEntry(content, Date.now());

    // Supermode: randomize theme and trigger global re-scramble on each keystroke
    if (isSupermode) {
      randomizeTheme();
      setScrambleSeed(s => s + 1);
    }
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
            0% { border-width: 6px; }
            50% { border-width: 4px; }
            100% { border-width: 6px; }
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

      {/* Sidebar - hidden in zen mode, minizen (wide), or narrow (unless toggled) */}
      {!zenMode && (isNarrow ? showSidebarInNarrow : !minizen) && (
      <div
        className="w-80 flex flex-col min-h-screen relative"
        style={{
          backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${Math.min(100, bgLightness + 2)}%)`,
          borderRight: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`
        }}
        onClick={closePanels}
      >
        {/* Clickable overlay for header zone - matches EntryHeader height */}
        {/* Wide mode: toggle minizen | Narrow mode: close sidebar */}
        {entryHeaderHeight > 0 && (
          <div
            className="absolute top-0 left-0 right-0 z-50"
            style={{ height: entryHeaderHeight }}
            onClick={(e) => {
              e.stopPropagation();
              if (isNarrow) {
                setShowSidebarInNarrow(false);
              } else {
                setMinizen(true); // Enter minizen (hide sidebar)
              }
              closePanels();
            }}
          />
        )}

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
              {isSupermode
                ? scrambleText(showAboutPanel ? `good days v${VERSION}` : 'good days')
                : (showAboutPanel ? `good days v${VERSION}` : 'good days')}
            </h1>
          </div>

          {/* Stats */}
          <div
            className="p-4 overflow-hidden"
            style={{ borderTop: `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` }}
          >
            <StatsDisplay
              entries={journal.entries}
              totalKeystrokes={stats.totalKeystrokes}
              totalSecondsOnApp={stats.totalSecondsOnApp}
              stacked={showDebugMenu && showAboutPanel}
              supermode={isSupermode}
              scrambleSeed={scrambleSeed}
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
              closePanels();
            }}
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
            <span>{isSupermode ? scrambleText(isScrambled ? 'unscramble' : 'scramble') : (isScrambled ? 'unscramble' : 'scramble')}</span>
          </FunctionButton>

          <FunctionButton onClick={() => {
            const opening = !showDebugMenu;
            setShowDebugMenu(opening);
            if (opening) {
              setZenMode(false); // Exit zen when opening panel
              setMinizen(false); // Exit minizen too
            }
          }} isActive={showDebugMenu} dataAttribute="settings-toggle">
            <Settings className="w-3 h-3" />
            <span>{isSupermode ? scrambleText('settings') : 'settings'}</span>
          </FunctionButton>

          <FunctionButton onClick={() => {
            const opening = !showAboutPanel;
            setShowAboutPanel(opening);
            if (opening) {
              setZenMode(false); // Exit zen when opening panel
              setMinizen(false); // Exit minizen too
            }
          }} isActive={showAboutPanel} dataAttribute="about-toggle">
            <Heart className="w-3 h-3" />
            <span>{isSupermode ? scrambleText('about') : 'about'}</span>
          </FunctionButton>
        </div>
      </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        showDebugMenu={showDebugMenu}
        hasPassword={auth.hasPassword}
        verifyPassword={auth.verifyPassword}
        setPassword={auth.setPassword}
        removePassword={auth.removePassword}
        entries={journal.entries}
        onImport={(entries) => {
          journal.setEntries(entries);
          setItem('journalEntries', JSON.stringify(entries));
          setEditorKey(k => k + 1); // Force editor remount to show imported content
        }}
        onCloseAbout={() => setShowAboutPanel(false)}
        stacked={showDebugMenu && showAboutPanel}
        supermode={isSupermode}
        scrambleSeed={scrambleSeed}
      />

      {/* About Panel */}
      <AboutPanel isOpen={showAboutPanel} onCloseSettings={() => setShowDebugMenu(false)} stacked={showDebugMenu && showAboutPanel} supermode={isSupermode} scrambleSeed={scrambleSeed} />

      {/* Main Editor Area */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ backgroundColor: `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` }}
        onClick={() => { if (isNarrow) closePanels(); }}
      >
        {/* Hide header in zen mode */}
        {!zenMode && (
          <EntryHeader
            selectedDate={journal.selectedDate}
            entries={journal.entries}
            paddingBottom={20}
            onClick={(e) => {
              e.stopPropagation(); // Prevent bubbling to container
              closePanels();
              if (isNarrow) {
                // Narrow: toggle sidebar visibility
                setShowSidebarInNarrow(!showSidebarInNarrow);
              } else {
                // Wide: toggle minizen (sidebar visibility)
                setMinizen(!minizen);
              }
            }}
            onHeightChange={setEntryHeaderHeight}
          />
        )}

        <JournalEditor
          key={editorKey}
          entries={journal.entries}
          selectedDate={journal.selectedDate}
          isScrambled={isScrambled}
          onInput={handleInput}
          editorRef={editorRef}
        />

        {/* Hide footer in zen mode. Click footer to enter zen. */}
        {!zenMode && (
          <EntryFooter
            currentContent={journal.currentContent}
            onClick={() => {
              closePanels();
              enterZen();
            }}
          />
        )}
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

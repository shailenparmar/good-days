import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Heart, Eye, EyeOff } from 'lucide-react';

// Feature imports
import { ThemeProvider, useTheme } from '@features/theme';
import { useAuth, LockScreen } from '@features/auth';
import { useJournalEntries, JournalEditor, EntrySidebar, EntryHeader, EntryFooter, htmlToText } from '@features/journal';
import { useStatistics, StatsDisplay } from '@features/statistics';
import { SettingsPanel, AboutPanel } from '@features/settings';

// Shared imports
import { saveAllJournalEntries } from '@shared/storage/journalStorage';
import { scrambleText, setScrambleSeed as updateGlobalScrambleSeed } from '@shared/utils/scramble';
import { getTodayDate } from '@shared/utils/date';
import { FunctionButton, ErrorBoundary } from '@shared/components';
import { VERSION } from '@shared/version';
import { logAction } from '@shared/logger';
import { WebSyncBridge } from '@shared/sync/WebSyncBridge';

// App-level hooks
import { useLayoutState } from './hooks/useLayoutState';
import { useMidnightTimer } from './hooks/useMidnightTimer';

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function MobileNotSupported() {
  const [colors, setColors] = useState(() => ({
    textHue: 144, textSat: 36, textLight: 43,
    bgHue: 84, bgSat: 100, bgLight: 94,
  }));

  const randomize = () => {
    const textHue = Math.floor(Math.random() * 360);
    const textSat = 20 + Math.floor(Math.random() * 60);
    const textLight = 25 + Math.floor(Math.random() * 35);
    const bgHue = Math.floor(Math.random() * 360);
    const bgSat = 30 + Math.floor(Math.random() * 70);
    const bgLight = 85 + Math.floor(Math.random() * 12);
    setColors({ textHue, textSat, textLight, bgHue, bgSat, bgLight });
  };

  const textColor = `hsl(${colors.textHue}, ${colors.textSat}%, ${colors.textLight}%)`;
  const bgColor = `hsl(${colors.bgHue}, ${colors.bgSat}%, ${colors.bgLight}%)`;

  return (
    <div
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>good</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>days</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>is</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>not</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>supported</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>on</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>mobile</p>
        <p style={{ color: textColor, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>yet</p>
        <button
          onClick={randomize}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: `3px solid ${textColor}`,
            borderRadius: '6px',
            color: textColor,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '16px',
          }}
        >
          rand
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Feature hooks
  const theme = useTheme();
  const auth = useAuth();
  const journal = useJournalEntries(auth.encryptionKeyReady);
  const layout = useLayoutState();

  // Stats hook - paused in superscramble to prevent jitter
  const stats = useStatistics(layout.isSuperscramble);

  // Refs for journal functions (avoids stale closures in midnight timer)
  const journalRef = useRef(journal);
  useEffect(() => { journalRef.current = journal; }, [journal]);

  // Midnight timer
  useMidnightTimer(editorRef, journalRef);

  const [editorKey, setEditorKey] = useState(0);
  const [scrambleSeed, setScrambleSeed] = useState(0);
  const [titleEditing, setTitleEditing] = useState(false);

  const { getColor, trackCurrentColorway, randomizeTheme, pairingCode } = theme;

  // Ref tracks the actual seed value so we can bump + sync the global in one call
  const scrambleSeedRef = useRef(scrambleSeed);
  const bumpScrambleSeed = useCallback((seed?: number) => {
    const next = seed ?? scrambleSeedRef.current + 1;
    scrambleSeedRef.current = next;
    updateGlobalScrambleSeed(next);
    setScrambleSeed(next);
  }, []);

  // Re-randomize scramble on every toggle-on
  useEffect(() => {
    if (layout.isScrambled) bumpScrambleSeed(Date.now());
  }, [layout.isScrambled, bumpScrambleSeed]);

  // Log app load (once on mount)
  useEffect(() => { logAction('app.load', { version: VERSION }); }, []);

  // Option/Alt+S hotkey for scramble toggle
  useEffect(() => {
    const handleHotkey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyS') {
        e.preventDefault();
        if (layout.scrambleHotkeyActive) {
          layout.setIsScrambled(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  }, [layout.scrambleHotkeyActive]);

  // ESC key behavior — unwind first, then bounce.
  // Phase 1: ESC resolves state top-down (exitZen → exitMinizen → closePanels).
  // Phase 2: Once neutral, ESC starts infinite bounce: base ↔ mz ↔ zen ↔ mz ↔ base ↔ ...
  // Tap ESC = one step (keydown). Hold ESC (~500ms) = revert step + lock.
  const escDirectionRef = useRef<'up' | 'down'>('up');
  const escLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of layout state before the cycle, so hold-to-lock can revert
  const escPreCycleRef = useRef<{
    zenMode: boolean; minizen: boolean; showSidebarInNarrow: boolean;
    showDebugMenu: boolean; showAboutPanel: boolean;
    preFocusState: typeof layout.preFocusState; zenFromMinizen: boolean;
    direction: 'up' | 'down';
  } | null>(null);

  // Reset direction on any non-ESC interaction
  useEffect(() => {
    const resetCycle = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') return;
      escDirectionRef.current = 'up';
    };
    window.addEventListener('keydown', resetCycle);
    window.addEventListener('mousedown', resetCycle);
    window.addEventListener('resize', resetCycle);
    return () => {
      window.removeEventListener('keydown', resetCycle);
      window.removeEventListener('mousedown', resetCycle);
      window.removeEventListener('resize', resetCycle);
    };
  }, []);

  // Clear lock timer on ESC keyup
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escLockTimerRef.current) {
          clearTimeout(escLockTimerRef.current);
          escLockTimerRef.current = null;
        }
        escPreCycleRef.current = null;
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !auth.isLocked) {
        if (e.defaultPrevented) return;
        if (e.repeat) return;

        if (layout.isScrambled) {
          layout.setIsScrambled(false);
          return;
        }

        const activeEl = document.activeElement;
        const tagName = activeEl?.tagName?.toLowerCase();
        if (tagName === 'input') return;

        // Snapshot full state before cycling (for hold-to-lock revert)
        escPreCycleRef.current = {
          zenMode: layout.zenModeRef.current,
          minizen: layout.minizenRef.current,
          showSidebarInNarrow: layout.showSidebarInNarrow,
          showDebugMenu: layout.showDebugMenu,
          showAboutPanel: layout.showAboutPanel,
          preFocusState: layout.preFocusState,
          zenFromMinizen: layout.zenFromMinizen,
          direction: escDirectionRef.current,
        };

        // Hold-to-lock: start timer — reverts cycle, then locks
        if (auth.hasPassword) {
          if (escLockTimerRef.current) clearTimeout(escLockTimerRef.current);
          escLockTimerRef.current = setTimeout(() => {
            escLockTimerRef.current = null;
            // Revert everything that happened on keydown
            const snap = escPreCycleRef.current;
            if (snap) {
              layout.setZenMode(snap.zenMode);
              layout.setMinizen(snap.minizen);
              layout.setShowSidebarInNarrow(snap.showSidebarInNarrow);
              layout.setShowDebugMenu(snap.showDebugMenu);
              layout.setShowAboutPanel(snap.showAboutPanel);
              layout.setPreFocusState(snap.preFocusState);
              layout.setZenFromMinizen(snap.zenFromMinizen);
              escDirectionRef.current = snap.direction;
              escPreCycleRef.current = null;
            }
            if (editorRef.current) {
              journal.saveEntry(editorRef.current.value || '', Date.now());
            }
            auth.lock();
          }, 500);
        }

        // Two-phase ESC: unwind saved state first, then bounce cycle.
        // Phase 1 (unwinding) uses state machine functions to restore.
        // Phase 2 (bounce) uses raw setters to cycle layouts.
        // Discriminator: preFocusState !== null (or zenFromMinizen) means
        // "entered via UI, has state to restore." null = bounce cycle.

        if (layout.isNarrow) {
          // --- NARROW: UNWINDING ---
          if (layout.zenModeRef.current && (layout.preFocusState !== null || layout.zenFromMinizen)) {
            layout.exitZen();
            escDirectionRef.current = 'down';
            return;
          }
          if (layout.showDebugMenu || layout.showAboutPanel) {
            layout.closePanels();
            escDirectionRef.current = 'up';
            return;
          }
          // --- NARROW: BOUNCE CYCLE (sidebar → mz → zen → mz → sidebar → ...) ---
          // Direction is flipped vs wide: 'up' (default/reset) → sidebar, 'down' → zen.
          // This means the first ESC from mz always goes toward base (sidebar).
          if (layout.zenModeRef.current) {
            layout.setZenMode(false);
            layout.setShowSidebarInNarrow(false);
            escDirectionRef.current = 'up';
            return;
          }
          if (!layout.showSidebarInNarrow) {
            if (escDirectionRef.current === 'up') {
              layout.setShowSidebarInNarrow(true);
              layout.setPreNarrowState(null);
            } else {
              layout.setZenMode(true);
            }
            return;
          }
          layout.setShowSidebarInNarrow(false);
          escDirectionRef.current = 'down';
          return;
        }

        // --- WIDE: UNWINDING ---
        if (layout.zenModeRef.current && (layout.preFocusState !== null || layout.zenFromMinizen)) {
          layout.exitZen();
          escDirectionRef.current = 'down';
          return;
        }
        if (layout.minizenRef.current && layout.preFocusState !== null) {
          layout.exitMinizen();
          escDirectionRef.current = 'down';
          return;
        }
        if (layout.showDebugMenu || layout.showAboutPanel) {
          layout.closePanels();
          escDirectionRef.current = 'up';
          return;
        }
        // --- WIDE: BOUNCE CYCLE (base → mz → zen → mz → base → ...) ---
        if (layout.zenModeRef.current) {
          layout.setZenMode(false);
          layout.setMinizen(true);
          escDirectionRef.current = 'down';
          return;
        }
        if (layout.minizenRef.current) {
          if (escDirectionRef.current === 'down') {
            layout.setMinizen(false);
          } else {
            layout.setZenMode(true);
          }
          return;
        }
        layout.setMinizen(true);
        escDirectionRef.current = 'up';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [auth, journal, layout]);

  // Auto-focus editor when typing anywhere
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toLowerCase();
      if (tagName === 'input') return;
      if (tagName === 'textarea' && !(activeEl as HTMLTextAreaElement).readOnly) return;

      if (editorRef.current?.contains(activeEl) && journal.selectedDate === getTodayDate()) return;
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (layout.showDebugMenu && (e.key === 'Backspace' || e.key === ' ')) {
        e.preventDefault();
        return;
      }

      const isPrintable = e.key.length === 1;
      const isEnterOrBackspace = e.key === 'Enter' || e.key === 'Backspace';
      if (!isPrintable && !isEnterOrBackspace) return;

      if (layout.isNarrow) {
        layout.closePanels();
        layout.setShowSidebarInNarrow(false);
      }

      const today = getTodayDate();
      if (journal.selectedDate !== today) {
        journal.setSelectedDate(today);
        e.preventDefault();
        const key = e.key;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!editorRef.current) return;
            editorRef.current.focus();
            const len = editorRef.current.value.length;
            editorRef.current.selectionStart = len;
            editorRef.current.selectionEnd = len;
            if (key.length === 1) {
              document.execCommand('insertText', false, key);
            } else if (key === 'Enter') {
              document.execCommand('insertText', false, '\n');
            }
          });
        });
        return;
      }

      if (editorRef.current) {
        editorRef.current.focus();
        const len = editorRef.current.value.length;
        editorRef.current.selectionStart = len;
        editorRef.current.selectionEnd = len;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [layout.showDebugMenu, layout.showAboutPanel, layout.isNarrow, layout.closePanels, journal.selectedDate, journal.setSelectedDate]);

  // Handle password unlock
  const handlePasswordSubmit = async (e: React.FormEvent): Promise<boolean> => {
    const success = await auth.handlePasswordSubmit(e);
    if (success) {
      journal.reloadEntries();
    }
    return success;
  };

  // Handle input with keystroke tracking
  const handleInput = (content: string) => {
    stats.incrementKeystrokes();
    trackCurrentColorway();
    journal.setCurrentContent(htmlToText(content));
    journal.saveEntry(content, Date.now());

    if (layout.isScrambled) {
      bumpScrambleSeed();
    }
    if (layout.isSuperscramble) {
      randomizeTheme();
    }
  };

  // Lock screen
  if (auth.isLocked && auth.hasPassword) {
    return (
      <LockScreen
        passwordInput={auth.passwordInput}
        onPasswordChange={auth.setPasswordInput}
        onSubmit={handlePasswordSubmit}
      />
    );
  }

  const stacked = layout.showDebugMenu && layout.showAboutPanel;

  return (
    <div className="flex" style={{ backgroundColor: 'hsl(var(--bh), var(--bs), var(--bl))', height: 'calc(100vh - env(titlebar-area-height, 0px))', marginTop: 'env(titlebar-area-height, 0px)' }}>
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
            color: hsla(var(--h), var(--s), var(--l), 0.4);
            opacity: 1;
          }
        `}
      </style>

      {/* Sidebar - hidden in zen mode, minizen (wide), or narrow (unless toggled) */}
      {!layout.zenMode && (layout.isNarrow ? layout.showSidebarInNarrow : !layout.minizen) && (
      <div
        className="w-80 flex flex-col relative"
        style={{
          backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
          borderRight: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)'
        }}
        onClick={() => layout.closePanels()}
      >
        {/* Clickable overlay for header zone */}
        {layout.entryHeaderHeight > 0 && (
          <div
            className="absolute top-0 left-0 right-0 z-50"
            style={{ height: layout.entryHeaderHeight }}
            onClick={(e) => {
              e.stopPropagation();
              if (layout.isNarrow) {
                layout.setShowSidebarInNarrow(false);
                layout.closePanels();
                layout.setPreNarrowState(null);
              } else {
                layout.enterMinizen();
              }
            }}
          />
        )}

        {/* Header */}
        <div
          className="sticky top-0 z-10"
          style={{
            backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
            borderBottom: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)'
          }}
        >
          <div className="p-4" ref={layout.titleRef}>
            {(() => {
              const showInfo = layout.showAboutPanel ? !layout.titleHovered : layout.titleHovered;
              const s = layout.isSuperscramble ? scrambleText : (t: string) => t;
              if (showInfo) {
                return (
                  <div className="text-center select-none" style={{ color: getColor() }}>
                    <h1 className="text-2xl font-extrabold font-mono tracking-tight">
                      {s(`v${VERSION}`)}
                    </h1>
                    <p className="text-2xl font-extrabold font-mono tracking-tight">
                      {s(`pairing code ${pairingCode || '---'}`)}
                    </p>
                  </div>
                );
              }
              return (
                <h1 className="text-2xl font-extrabold font-mono tracking-tight text-center select-none" style={{ color: getColor() }}>
                  {s('good days')}
                </h1>
              );
            })()}
          </div>

          {/* Stats */}
          <div
            className="p-3 overflow-hidden"
            style={{ borderTop: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)' }}
          >
            <StatsDisplay
              entries={journal.entries}
              totalKeystrokes={stats.totalKeystrokes}
              totalSecondsOnApp={stats.totalSecondsOnApp}
              stacked={stacked}
              superscramble={layout.isSuperscramble}
              scrambleSeed={scrambleSeed}
            />
          </div>
        </div>

        {/* Entries list */}
        <div
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
          <EntrySidebar
            entries={journal.entries}
            selectedDate={journal.selectedDate}
            onSelectDate={(date) => {
              journal.setSelectedDate(date);
              layout.closePanels();
            }}
            settingsOpen={layout.showDebugMenu}
            stacked={stacked}
            isScrambled={layout.isScrambled}
            superscramble={layout.isSuperscramble}
            scrambleSeed={scrambleSeed}
          />
        </div>

        {/* Bottom buttons */}
        <div
          className="p-4 space-y-2"
          style={{
            backgroundColor: 'hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))',
            borderTop: '6px solid hsla(var(--h), var(--s), var(--l), 0.85)'
          }}
        >
          <FunctionButton onClick={() => layout.setIsScrambled(!layout.isScrambled)} isActive={layout.isScrambled}>
            {layout.isScrambled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>{layout.isSuperscramble ? scrambleText(layout.isScrambled ? 'unscramble' : 'scramble') : (layout.isScrambled ? 'unscramble' : 'scramble')}</span>
          </FunctionButton>

          <FunctionButton onClick={() => {
            const opening = !layout.showDebugMenu;
            layout.setShowDebugMenu(opening);
            if (opening) {
              layout.setZenMode(false);
              layout.setMinizen(false);
              layout.setPreFocusState(null);
              layout.setZenFromMinizen(false);
              if (layout.isNarrow) layout.setShowSidebarInNarrow(true);
            }
            if (layout.isNarrow) layout.setPreNarrowState(null);
          }} isActive={layout.showDebugMenu} dataAttribute="settings-toggle">
            <Settings className="w-3 h-3" />
            <span>{layout.isSuperscramble ? scrambleText('settings') : 'settings'}</span>
          </FunctionButton>

          <FunctionButton onClick={() => {
            const opening = !layout.showAboutPanel;
            layout.setShowAboutPanel(opening);
            if (opening) {
              layout.setZenMode(false);
              layout.setMinizen(false);
              layout.setPreFocusState(null);
              layout.setZenFromMinizen(false);
              if (layout.isNarrow) layout.setShowSidebarInNarrow(true);
            }
            if (layout.isNarrow) layout.setPreNarrowState(null);
          }} isActive={layout.showAboutPanel} dataAttribute="about-toggle">
            <Heart className="w-3 h-3" />
            <span>{layout.isSuperscramble ? scrambleText('about') : 'about'}</span>
          </FunctionButton>
        </div>
      </div>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        showDebugMenu={layout.showDebugMenu}
        hasPassword={auth.hasPassword}
        verifyPassword={auth.verifyPassword}
        setPassword={auth.setPassword}
        changePassword={auth.changePassword}
        removePassword={auth.removePassword}
        entries={journal.entries}
        onImport={(entries) => {
          logAction('app.import', { entryCount: entries.length });
          journal.setEntries(entries);
          saveAllJournalEntries(entries);
          setEditorKey(k => k + 1);
        }}
        stacked={stacked}
        superscramble={layout.isSuperscramble}
        scrambleSeed={scrambleSeed}
        scrambleHotkeyActive={layout.scrambleHotkeyActive}
        onToggleScrambleHotkey={() => layout.setScrambleHotkeyActive(prev => !prev)}
      />

      {/* About Panel */}
      <AboutPanel isOpen={layout.showAboutPanel} stacked={stacked} superscramble={layout.isSuperscramble} scrambleSeed={scrambleSeed} />

      {/* Main Editor Area */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--bh), var(--bs), var(--bl))' }}
        onClick={() => { if (layout.isNarrow) layout.closePanels(); }}
      >
        {/* Hide header in zen mode */}
        {!layout.zenMode && (
          <EntryHeader
            selectedDate={journal.selectedDate}
            entries={journal.entries}
            paddingBottom={20}
            isScrambled={layout.isScrambled}
            superscramble={layout.isSuperscramble}
            scrambleSeed={scrambleSeed}
            stacked={stacked}
            saveTitle={journal.saveTitle}
            onClick={(e) => {
              e.stopPropagation();
              if (layout.isNarrow) {
                layout.setShowSidebarInNarrow(!layout.showSidebarInNarrow);
                layout.closePanels();
                layout.setPreNarrowState(null);
              } else {
                if (layout.minizen) {
                  layout.exitMinizen();
                } else {
                  layout.enterMinizen();
                }
              }
            }}

            onHeightChange={layout.setEntryHeaderHeight}
            onEditingChange={setTitleEditing}
            onTitleInput={() => {
              if (layout.isScrambled) bumpScrambleSeed();
              if (layout.isSuperscramble) randomizeTheme();
            }}
            editorRef={editorRef}
          />
        )}

        <JournalEditor
          key={editorKey}
          entries={journal.entries}
          selectedDate={journal.selectedDate}
          isScrambled={layout.isScrambled}
          isSuperscramble={layout.isSuperscramble}
          onInput={handleInput}
          editorRef={editorRef}
          externalContentVersion={journal.externalContentVersion}
          hidePlaceholder={titleEditing}
          scrambleSeed={scrambleSeed}
          onClick={() => {
            if (layout.isNarrow) {
              layout.closePanels();
              layout.setShowSidebarInNarrow(false);
            }
          }}
        />

        {/* Hide footer in zen mode. Click footer to enter zen. */}
        {!layout.zenMode && (
          <EntryFooter
            currentContent={journal.currentContent}
            superscramble={layout.isSuperscramble}
            scrambleSeed={scrambleSeed}
            onClick={() => layout.enterZen()}
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
        <WebSyncBridge />
        <AppContent />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

import { useState, useEffect, useRef, useCallback } from 'react';
import { getItem, setItem, removeItem } from '@shared/storage';
import { usePersisted } from '@shared/hooks';
import { markEasterEggFound } from '@shared/utils/easterEggs';

const COLLAPSE_BREAKPOINT = 711;

export function useLayoutState() {
  // If previous session was in a focus mode (zen/minizen), preFocusState has the panel
  // state from before entering that mode. Use it to restore panels on refresh.
  // This read + clear happens synchronously before useState initializers consume it.
  const savedPanelState = (() => {
    try {
      const raw = getItem('preFocusState');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          removeItem('preFocusState');
          return parsed;
        }
      }
    } catch { /* corrupted state, ignore */ }
    return null;
  })();

  // Panel and scramble state
  const [showDebugMenu, setShowDebugMenu] = useState(() => {
    if (savedPanelState) return savedPanelState.showDebugMenu;
    return getItem('showSettings') === 'true';
  });
  const [showAboutPanel, setShowAboutPanel] = useState(() => {
    if (savedPanelState) return savedPanelState.showAboutPanel;
    return getItem('showAbout') === 'true';
  });
  const [isScrambled, setIsScrambled] = useState(() => {
    return getItem('isScrambled') === 'true';
  });
  const [scrambleHotkeyActive, setScrambleHotkeyActive] = useState(() => {
    return getItem('scrambleHotkeyActive') === 'true';
  });

  // Superscramble: scramble + settings + about all open = chaos mode
  const isSuperscramble = isScrambled && showDebugMenu && showAboutPanel;

  // Responsive sidebar
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < COLLAPSE_BREAKPOINT);
  const [showSidebarInNarrow, setShowSidebarInNarrow] = useState(() => {
    const narrow = window.innerWidth < 711;
    if (!narrow) return false;
    const saved = getItem('showSidebarInNarrow');
    if (saved !== null) return saved === 'true';
    const panelsOpen = savedPanelState
      ? (savedPanelState.showDebugMenu || savedPanelState.showAboutPanel)
      : (getItem('showSettings') === 'true' || getItem('showAbout') === 'true');
    return panelsOpen;
  });

  // Focus modes
  const [zenMode, setZenMode] = useState(false);
  const [minizen, setMinizen] = useState(false);
  const zenModeRef = useRef(zenMode);
  useEffect(() => { zenModeRef.current = zenMode; }, [zenMode]);
  const minizenRef = useRef(minizen);
  useEffect(() => { minizenRef.current = minizen; }, [minizen]);

  // Unified state saved before entering any focus mode
  const [preFocusState, setPreFocusState] = usePersisted<{
    minizen: boolean;
    showSidebarInNarrow: boolean;
    showDebugMenu: boolean;
    showAboutPanel: boolean;
  } | null>('preFocusState', null);
  const [zenFromMinizen, setZenFromMinizen] = useState(false);
  const [entryHeaderHeight, setEntryHeaderHeight] = useState(0);
  const [titleHovered, setTitleHovered] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  const titleMaxHeight = useRef(0);

  // State saved before narrowing window
  const [preNarrowState, setPreNarrowState] = useState<{
    showDebugMenu: boolean;
    showAboutPanel: boolean;
    minizen: boolean;
  } | null>(null);

  // --- Actions ---

  const closePanels = useCallback(() => {
    setShowDebugMenu(false);
    setShowAboutPanel(false);
  }, []);

  const exitZen = useCallback(() => {
    setZenMode(false);
    if (zenFromMinizen) {
      setZenFromMinizen(false);
    } else if (preFocusState) {
      setMinizen(preFocusState.minizen);
      setShowSidebarInNarrow(preFocusState.showSidebarInNarrow);
      setShowDebugMenu(preFocusState.showDebugMenu);
      setShowAboutPanel(preFocusState.showAboutPanel);
      setPreFocusState(null);
    }
  }, [preFocusState, setZenMode, zenFromMinizen]);

  const enterZen = useCallback(() => {
    if (minizen) {
      setZenFromMinizen(true);
    } else {
      setPreFocusState({
        minizen,
        showSidebarInNarrow,
        showDebugMenu,
        showAboutPanel,
      });
      setShowDebugMenu(false);
      setShowAboutPanel(false);
      setZenFromMinizen(false);
    }
    setZenMode(true);
  }, [minizen, showSidebarInNarrow, showDebugMenu, showAboutPanel, setZenMode]);

  const enterMinizen = useCallback(() => {
    setPreFocusState({
      minizen,
      showSidebarInNarrow,
      showDebugMenu,
      showAboutPanel,
    });
    setMinizen(true);
    setShowDebugMenu(false);
    setShowAboutPanel(false);
  }, [minizen, showSidebarInNarrow, showDebugMenu, showAboutPanel]);

  const exitMinizen = useCallback(() => {
    setMinizen(false);
    if (preFocusState) {
      setShowSidebarInNarrow(preFocusState.showSidebarInNarrow);
      setShowDebugMenu(preFocusState.showDebugMenu);
      setShowAboutPanel(preFocusState.showAboutPanel);
      setPreFocusState(null);
    }
  }, [preFocusState]);

  // --- Effects ---

  // Title hover detection via coordinates (document-level to bypass z-50 overlay).
  // Entry-first principle: you must reach the visible title to trigger hover.
  // Once hovered, the exit zone expands to max(entry height, live height) so
  // content toggling (1-line ↔ 2-line) doesn't cause flicker. On unhover,
  // the expanded zone resets — next entry requires reaching the visible title again.
  useEffect(() => {
    const onResize = () => { titleMaxHeight.current = 0; setTitleHovered(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reset title hover when about panel toggles — default/hover content swaps,
  // so the old max height from one mode is stale for the other.
  useEffect(() => {
    titleMaxHeight.current = 0;
    setTitleHovered(false);
  }, [showAboutPanel]);

  useEffect(() => {
    const check = (e: MouseEvent) => {
      if (!titleRef.current) { setTitleHovered(false); return; }
      const rect = titleRef.current.getBoundingClientRect();

      if (titleMaxHeight.current > 0) {
        // Already hovered — expand exit zone to max height seen
        titleMaxHeight.current = Math.max(titleMaxHeight.current, rect.height);
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
          && e.clientY >= rect.top && e.clientY <= rect.top + titleMaxHeight.current;
        if (!inside) {
          titleMaxHeight.current = 0;
          setTitleHovered(false);
        }
      } else {
        // Not hovered — use live rect for entry detection
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
          && e.clientY >= rect.top && e.clientY <= rect.top + rect.height;
        if (inside) {
          titleMaxHeight.current = rect.height;
          setTitleHovered(true);
        }
      }
    };
    document.addEventListener('mousemove', check);
    document.addEventListener('mouseover', check);
    return () => {
      document.removeEventListener('mousemove', check);
      document.removeEventListener('mouseover', check);
    };
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth < COLLAPSE_BREAKPOINT;
      const wasNarrow = isNarrow;
      setIsNarrow(narrow);

      if (narrow !== wasNarrow) {
        if (narrow && !wasNarrow) {
          const stateToSave = preFocusState
            ? { showDebugMenu: preFocusState.showDebugMenu, showAboutPanel: preFocusState.showAboutPanel, minizen: preFocusState.minizen }
            : { showDebugMenu, showAboutPanel, minizen };
          setPreNarrowState(stateToSave);
          closePanels();
          setPreFocusState(null);
          setZenFromMinizen(false);
          setMinizen(false);
          setShowSidebarInNarrow(false);
        } else if (!narrow && wasNarrow) {
          if (preNarrowState && !zenMode) {
            setShowDebugMenu(preNarrowState.showDebugMenu);
            setShowAboutPanel(preNarrowState.showAboutPanel);
            setMinizen(preNarrowState.minizen);
            setPreNarrowState(null);
          }
          setShowSidebarInNarrow(false);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isNarrow, closePanels, showDebugMenu, showAboutPanel, preNarrowState, preFocusState, zenMode]);

  // Clean up stale focus mode keys
  useEffect(() => {
    removeItem('zenMode');
    removeItem('minizen');
    removeItem('zenFromMinizen');
  }, []);

  // PWA resume handler
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;

    let hiddenAt: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt) {
        const elapsed = Date.now() - hiddenAt;
        hiddenAt = null;

        if (elapsed > 2000) {
          const raw = getItem('preFocusState');
          if (raw) {
            try {
              const saved = JSON.parse(raw);
              if (saved) {
                removeItem('preFocusState');
                setZenMode(false);
                setMinizen(false);
                setZenFromMinizen(false);
                setShowDebugMenu(saved.showDebugMenu);
                setShowAboutPanel(saved.showAboutPanel);
                setShowSidebarInNarrow(saved.showSidebarInNarrow);
                setPreFocusState(null);
              }
            } catch { /* corrupted state, ignore */ }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Panel persistence (skip during focus modes)
  useEffect(() => {
    if (!zenMode && !minizen) setItem('showSettings', String(showDebugMenu));
  }, [showDebugMenu, zenMode, minizen]);

  useEffect(() => {
    if (!zenMode && !minizen) setItem('showAbout', String(showAboutPanel));
  }, [showAboutPanel, zenMode, minizen]);

  useEffect(() => {
    if (!zenMode && !minizen) setItem('showSidebarInNarrow', String(showSidebarInNarrow));
  }, [showSidebarInNarrow, zenMode, minizen]);

  // Scramble persistence
  useEffect(() => {
    setItem('isScrambled', String(isScrambled));
  }, [isScrambled]);

  useEffect(() => {
    setItem('scrambleHotkeyActive', String(scrambleHotkeyActive));
  }, [scrambleHotkeyActive]);

  // Easter egg tracking
  useEffect(() => {
    if (showDebugMenu && showAboutPanel) markEasterEggFound('powerstatMode');
  }, [showDebugMenu, showAboutPanel]);


  useEffect(() => {
    if (zenMode) markEasterEggFound('zenMode');
  }, [zenMode]);

  return {
    // Layout modes
    zenMode, zenModeRef, minizen, minizenRef, isNarrow,
    // Panel visibility
    showDebugMenu, setShowDebugMenu,
    showAboutPanel, setShowAboutPanel,
    showSidebarInNarrow, setShowSidebarInNarrow,
    // Scramble
    isScrambled, setIsScrambled,
    scrambleHotkeyActive, setScrambleHotkeyActive,
    isSuperscramble,
    // Title
    titleHovered, titleRef,
    // Entry header
    entryHeaderHeight, setEntryHeaderHeight,
    // Actions
    enterZen, exitZen, enterMinizen, exitMinizen,
    closePanels,
    // State management (for panel toggle handlers)
    setPreNarrowState, setPreFocusState, setZenFromMinizen,
    setZenMode, setMinizen,
    // Focus state values (for ESC handler unwinding detection)
    preFocusState, zenFromMinizen,
  };
}

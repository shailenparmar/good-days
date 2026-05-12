# Claude Code Instructions — Source

## UI Conventions

- All scrollable areas should use `scrollbar-hide` class to hide scrollbars. This class also sets `overscroll-behavior-y: contain` (v2.6.50+) which enables rubber-band bounce at scroll boundaries without chaining to the parent (`body` has `overflow: hidden`).
- Theme colors are HSL-based and managed via ThemeContext
- For borders, lines, and opacity values, see **Opacity Standards**, **Line Styles**, and **Poweruser Menu Spacing** sections below
- **Cursor styles** - Default arrow cursor everywhere except selectable text. Enforced in `src/index.css`:
  ```css
  *, *::before, *::after { cursor: inherit; }
  html { cursor: default; }
  [contenteditable="true"], .cursor-text { cursor: text; }
  ```
  Use `cursor-text` class for non-editable but selectable text (e.g., color stats in poweruser menu).
- **Safari toolbar tinting (v2.1.16+)** - Safari's toolbar/tab bar tints to match the page background. Three things keep it in sync:
  1. `index.html` IIFE sets `theme-color` meta + `<html>`/`<body>` background on initial load (from localStorage, hex format)
  2. `ThemeContext.tsx` effect updates theme-color meta via `setAttribute` + syncs `documentElement.style.backgroundColor` + `body.style.backgroundColor` on every bg color change. During live mode (v2.3.21+), sets all three to `#000000` for the entire session — restores when phone disconnects (`isLiveActive` flips false).
  3. Mobile `main.tsx` overrides all to `#000000` (mobile always has black chrome)

  **Must use hex format** — Safari handles hex more reliably than HSL for `theme-color`. The meta tag has `id="theme-color-meta"` for fast lookup.

  **macOS Safari limitation:** The toolbar color is determined by Safari internally sampling the rendered page background — NOT by reading the `theme-color` meta tag dynamically. The meta tag is only read on page load. Live color changes will NOT update the toolbar in real-time. Safari re-evaluates on its own schedule (tab switch, scroll, navigation). This is a browser limitation with no workaround. Attempted: `setAttribute`, remove+re-insert meta — neither triggers live updates.
- **A REFRESH DOES NOT CHANGE WHAT YOU SEE** - All visible UI state must be persisted to localStorage. If the user can see it before refresh, they must see it after refresh. This includes panels, sidebar visibility, scramble state, etc. **Exception: zen and minizen modes** — these are ephemeral focus states that reset on refresh (see below).

### Zen/Minizen Refresh Behavior (v1.10.37+)

**Zen and minizen are NOT persisted across refresh.** Refreshing always returns to base state (sidebar visible, panels restored). This is an intentional escape hatch for users who accidentally enter these modes.

**How panel restoration works (v1.10.49+):**
- The panel persistence effects (`showSettings`/`showAbout` writes to localStorage) are **guarded**: they skip writes when `zenMode || minizen` is true. This means entering a focus mode closes panels in React state but does NOT overwrite their pre-focus values in localStorage.
- On refresh, `zenMode` and `minizen` reset to false (plain `useState(false)`). Panels initialize from `showSettings`/`showAbout` in localStorage, which still hold the correct pre-focus values.
- `preFocusState` (persisted via `usePersisted`) is still used for the live ESC/exit path (restoring panels without a refresh). The init IIFE reads it as a secondary fallback.
- **The guarded effects are the primary mechanism.** The IIFE + preFocusState consumption is belt-and-suspenders.

**PWA resume handler (v1.10.47+):**
In standalone PWA mode, "closing and reopening" the app often doesn't trigger a true page reload — iOS/macOS keeps the page alive in memory. The IIFE (which runs on page load) never executes, so focus modes persist. A `visibilitychange` handler detects when the PWA resumes from background (hidden > 2 seconds) and performs the same reset: reads `preFocusState` from localStorage, restores panels, exits focus modes. Only active in standalone mode (`display-mode: standalone` or iOS `navigator.standalone`). Browser users use Cmd+R which triggers a real reload.

**Edge case: direct focus exit via panel buttons.**
When clicking the settings/about buttons exits focus mode directly (bypassing `exitMinizen`/`exitZen`), `setPreFocusState(null)` and `setZenFromMinizen(false)` are called to prevent stale panel restore on next refresh.

### Scroll Position Persistence

Scroll positions persist across refresh. Settings/About save to localStorage (debounced 100ms). Editor uses `useKeyedPersisted` for per-date positions with double `requestAnimationFrame` to ensure content renders before restoring. The `\time` command captures and restores `scrollTop` in the same rAF to prevent scroll jump.

Code: `SettingsPanel.tsx`, `AboutPanel.tsx`, `JournalEditor.tsx`

## CSS Custom Properties for Live Streaming (v2.4.6+, simplified v2.4.9)

All inline HSL color styles throughout the app reference CSS custom properties on `:root` instead of React state template literals. This minimizes DOM attribute updates during re-renders (React sees static strings).

### CSS Variable Schema

Six custom properties on `document.documentElement`:
- `--h` (text hue, unitless), `--s` (text saturation, with `%`), `--l` (text lightness, with `%`)
- `--bh` (bg hue, unitless), `--bs` (bg saturation, with `%`), `--bl` (bg lightness, with `%`)

Usage: `hsl(var(--h), var(--s), var(--l))` — the `%` is baked into the variable value.

### How It Works

1. **Pre-React (`index.html` IIFE):** Reads all 6 color values from localStorage and sets CSS vars before React mounts. Prevents color flash.

2. **ThemeContext:** A `useEffect` syncs CSS vars whenever React color state changes. `getColor()` and `getBgColor()` return static CSS variable strings (e.g. `hsl(var(--h), var(--s), var(--l))`). React sees the same string every render — no DOM attribute updates needed.

3. **WebSyncBridge (streaming, v2.4.85+):** The rAF callback sets CSS vars **directly** on `document.documentElement`, bypassing React state entirely during streaming. Zero re-renders per frame. React state syncs once on stream-stop (via `applyLivePreset`) and on disconnect (via individual setters). During local desktop drag, falls back to `setLivePreset` only. ColorPicker indicators and save-preset work correctly because they use CSS vars or sync on stream-stop.

### Common CSS Variable Patterns

| Before | After |
|--------|-------|
| `` `hsl(${bgHue}, ${bgSaturation}%, ${bgLightness}%)` `` | `hsl(var(--bh), var(--bs), var(--bl))` |
| `` `hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` `` | `hsla(var(--h), var(--s), var(--l), 0.85)` |
| `` `hsl(${bgHue}, ..., ${Math.min(100, bgLightness+2)}%)` `` | `hsl(var(--bh), var(--bs), min(100%, calc(var(--bl) + 2%)))` |
| `` `hsl(${hue}, ..., ${Math.max(0, lightness*0.65)}%)` `` | `hsl(var(--h), var(--s), max(0%, calc(var(--l) * 0.65)))` |

### Files NOT Converted (intentionally)

- `PresetGrid.tsx` — uses preset object colors, not current theme
- `MobileApp.tsx` — phone side, not affected by desktop streaming
- `confirmColor.ts` — computational WCAG contrast, needs raw numbers
- `StatsDisplay.tsx` color hex display — text output, not CSS styling

## Hot-Path Counters: Ref + rAF Subscription (v3.1.24+)

For counters incremented on every keystroke (or any high-frequency event), do **not** put the value in React state. Pattern:

1. The producer (`useStatistics`) mutates `keystrokesRef.current += 1` per event. Zero React work.
2. A slow `setInterval` (1s) still syncs ref → state for **persistence** (localStorage save effect listens to that state).
3. Display components that want a live count subscribe to the ref via `requestAnimationFrame` with a bailout — only call `setState` when `ref.current !== last`.

The result: 60Hz visual update with re-renders scoped to the one component that displays the count. The rest of the tree never re-renders during typing.

Don't pass live counters through `App.tsx` props — that re-renders the world on every keystroke. Pass the ref + a fallback prop, and let the leaf subscribe.

## Screen Copy Approval Policy

**All user-facing copy and screens must be approved by the user.** Do not add new text screens without approval. Currently approved:
- "something went wrong" (error boundary) — DEFAULT_PRESET_1 colors (dark olive text on light yellow bg)

There is no loading screen (v2.2.8+). The app renders immediately with empty entries; content pops in once IndexedDB loads. Any new screens or copy require user sign-off.

## Lock Screen Must Be First Render Gate (v2.2.6+)

The lock screen check (`auth.isLocked && auth.hasPassword`) MUST be the first conditional return in `AppContent`. No other gates (loading, etc.) should come before it. Without this, password-protected users can't reach the lock screen because `encryptionKeyReady` stays `false` until the password is entered.

## Function Menus

**Function menus** are the panels that open from the sidebar buttons: **Settings**, **About**, and **Scramble** (toggle). Any combination of these can be open at once.

### Click-to-Close Behavior

Clicking outside function menus closes them. The clickable regions:

| Area | Closes function menus? |
|------|------------------------|
| Sidebar (entries list, empty space) | Yes |
| Settings panel body | Yes |
| About panel body | Yes |
| Main editor area | Yes (narrow mode only) |
| Colorstats area (HSL/HEX values) | **No** - protected for text selection |
| Title area ("good days") | **No** - protected for minizen toggle |

The colorstats area is the only protected region in poweruser mode. This allows copy/paste of color values while still letting users click anywhere else to dismiss panels.

Code locations:
- Sidebar container: `src/App.tsx` (line ~522, `onClick={closePanels}`)
- Colorstats protection: `src/features/statistics/components/StatsDisplay.tsx` (inner grid div with `stopPropagation`)
- Panel click handlers: `SettingsPanel.tsx` and `AboutPanel.tsx` (`onClick={onCloseAbout/onCloseSettings}`)

## Power Modes

The app has special modes that activate when multiple panels are open.

### Poweruser Mode

**Trigger**: Settings + About panels both open

| Feature | Description |
|---------|-------------|
| About panel shrinks | Width goes from 600px → 280px |
| Scramble hotkey toggle | Button appears in Settings to enable Option/Alt+S hotkey |
| Horizontal stats | StatsDisplay switches to horizontal layout |
| Export debug log button | Downloads human-readable action log for debugging |
| Reset app button | Appears at bottom of Settings panel (with RotateCcw icon) |
| Easter egg tracking | `powerstatMode` is marked as found |

### Reset App Button

Only visible in poweruser mode. Three-step confirmation:

1. "reset app" → click
2. "are you sure?" → click
3. "are you sure you're sure?!" → click → clears localStorage + IndexedDB, reloads

**Behavior**: Moving mouse off the button at any step resets back to "reset app".

**Blackout overlay (v1.10.54+):** At step 3, a full-screen black overlay covers the viewport. The reset button stands out against it with the app's background color. The overlay is rendered via `createPortal` to `document.body` (zIndex 9998) to avoid stacking context issues from the settings panel's `overflow-y-auto`. The button wrapper uses zIndex 9999 with the app's background color and `rounded` corners.

Code location: `src/features/settings/components/SettingsPanel.tsx`

### Powerscramble Mode

**Trigger**: Scramble ON + Settings + About all active together (internally called `isSuperscramble`)

Includes all poweruser menu features, plus:

| Feature | Description |
|---------|-------------|
| Theme randomizes on keystroke | Each character typed randomizes the colorway |
| Global re-scramble on keystroke | All scrambled text re-randomizes on input |
| Time tracking paused | Stats timer pauses to prevent jitter |
| All UI text scrambled | Title, buttons, stats, sidebar entries all scramble |
| Easter egg tracking | `superscramble` is marked as found |

Code location: `src/App.tsx` (isSuperscramble definition, line ~110)

## Panel Dimensions

| Panel | Width | Notes |
|-------|-------|-------|
| Sidebar | 320px (`w-80`) | Includes 6px right border |
| Settings | 320px (`w-80`) | Includes 6px right border |
| About (alone) | 600px | Includes 6px right border |
| About (stacked) | 280px | Includes 6px right border |

### Right Edge Alignment (IMPORTANT)

The About panel's right edge stays at the **same horizontal position** whether in About-only mode or poweruser mode.

#### The Math

Tailwind uses `box-sizing: border-box` globally, meaning **borders are inside the width**, not added to it.

```
About-only mode:
  Sidebar (320px) + About (600px) = 920px right edge

Poweruser mode:
  Sidebar (320px) + Settings (320px) + About (280px) = 920px right edge
```

Both modes have the same right edge position (1040px from viewport left).

#### Implementation

Constants in `AboutPanel.tsx`:

```tsx
// Widths INCLUDE the 6px border (border-box sizing)
const ABOUT_WIDTH = 600;    // About panel width when alone
const SETTINGS_WIDTH = 320; // Settings panel width (w-80)

const aboutWidth = stacked
  ? ABOUT_WIDTH - SETTINGS_WIDTH  // 600 - 320 = 280px
  : ABOUT_WIDTH;                   // 600px
```

## Opacity Standards

All opacities in the app follow this hierarchy:

| Tier | Opacity | Use |
|------|---------|-----|
| **Full** | 100% | Text content, active states |
| **Strong** | 85% | Panel lines, dividers, placeholders |
| **Medium** | 60% | Resting borders (buttons/inputs) |
| **Muted** | 50% | Disabled states |
| **Subtle** | 20% | Hover backgrounds |

### Where Each Opacity Appears

**85% opacity:**
- Panel lines (6px borders): `hsla(..., 0.85)`
- Dividers (2px borders): `hsla(..., 0.85)`
- Placeholder text: `opacity: 0.85`
- GitHub link hover: instant color change to confirm color (no transition)

**60% opacity:**
- FunctionButton border default
- TimeDisplay border
- EntrySidebar border
- LockScreen border
- PasswordSettings border/divider
- ColorPicker hue needles and SL dots (v2.6.54+)

**20% opacity:**
- Hover backgrounds on all interactive elements: `hsla(..., 0.2)`

## Line Styles

### Panel Lines

Thick structural borders used to separate major UI sections.

| Property | Value |
|----------|-------|
| Thickness | 6px |
| Style | solid |
| Opacity | 0.85 |
| Format | `6px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` |

Used on: sidebar right edge, header bottom, footer top, settings/about panel edges.

### Dividers

Thin lines used to separate content within a section.

| Property | Value |
|----------|-------|
| Thickness | 2px |
| Style | solid |
| Opacity | 0.85 |
| Format | `2px solid hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)` |

Used on: stats section separators in poweruser mode.

## Poweruser Menu Spacing

The stats display in poweruser mode uses these specific spacing values:

```
═══════════════════════════════════════════  ← 6px panel line
│                                         │
│←────────── p-3 (12px padding) ─────────→│
│                                         │
│  ┌────────────┐      ┌────────────┐     │
│  │  stat 1    │ 0px  │  stat 2    │     │
│  └────────────┘ gap  └────────────┘     │
│        │                                │
│        │ 4px (gap-y-1)                  │
│        ▼                                │
│  ┌────────────┐      ┌────────────┐     │
│  │  stat 3    │      │  stat 4    │     │
│  └────────────┘      └────────────┘     │
│        │                                │
│        │ 12px (mt-3)                    │
│        ▼                                │
│  ──────────────────────────────────     │  ← 2px divider
│        │                                │
│        │ 12px (pt-3)                    │
│        ▼                                │
│  ┌────────────┐      ┌────────────┐     │
│  │  stat 5    │      │  stat 6    │     │
│  └────────────┘      └────────────┘     │
```

| Element | Class/Value | Pixels |
|---------|-------------|--------|
| Outer padding | `p-3` | 12px |
| Column gap | `gap-x-0` | 0px |
| Row gap | `gap-y-1` | 4px |
| Space above divider | `mt-3` | 12px |
| Space below divider | `pt-3` | 12px |
| Panel line thickness | | 6px |
| Divider thickness | | 2px |

Code location: `src/features/statistics/components/StatsDisplay.tsx`

## Bold Sweep Animation

The signature placeholder animation: text sweeps bold left-to-right, then unbolds left-to-right. Uses `boldCount` (incrementing index) and `animPhase` ('bold' | 'unbold') state variables. **83ms per character** (~12 chars/second). Full cycle for "start typing": ~2 seconds.

| Location | Text | File |
|----------|------|------|
| Editor placeholder | "start typing" | `JournalEditor.tsx` |
| Lock screen | "password" | `LockScreen.tsx` |
| Password settings | varies | `PasswordSettings.tsx` |
| Preset keyboard hint | "use arrow keys..." | `PresetGrid.tsx` |

Resets (`boldCount = 0`, `animPhase = 'bold'`) when placeholder becomes visible or component mounts.

## Layout Modes & Focus States

The app has two layout modes (wide/narrow) and two focus states (minizen/zen).

### Concepts

| Term | Meaning |
|------|---------|
| **Full** | Everything visible: sidebar + header + editor + footer |
| **Minizen** | Sidebar hidden, header + editor + footer visible (focused but oriented) |
| **Zen** | Just editor. Pure writing, no distractions |

### State Variables (in `src/hooks/useLayoutState.ts` and App.tsx)

| Variable | Purpose | Persisted | Default |
|----------|---------|-----------|---------|
| `isNarrow` | `true` when window < 711px | No (computed) | — |
| `zenMode` | Full zen: just editor, hide everything else | **No** (v1.10.37+) | `false` |
| `minizen` | Minizen: hide sidebar, keep header+footer (wide only) | **No** (v1.10.37+) | `false` |
| `showSidebarInNarrow` | Override to show sidebar in narrow mode | **Yes** (v2.3.25+) | `false` (reads from localStorage, falls back to panels-open check) |
| `showDebugMenu` | Settings panel open | Yes | `false` |
| `showAboutPanel` | About panel open | Yes | `false` |
| `preFocusState` | Saved state before entering zen/minizen (for restore) | Yes | `null` |
| `preNarrowState` | Saved state before narrowing (for restore on widen) | No | `null` |
| `zenFromMinizen` | Tracks if zen was entered from minizen (for proper exit) | **No** (v1.10.37+) | `false` |

### State Variable Schemas

```tsx
// Saved when entering zen or minizen (restored on exit)
preFocusState: {
  minizen: boolean;
  showSidebarInNarrow: boolean;
  showDebugMenu: boolean;
  showAboutPanel: boolean;
} | null

// Saved when resizing wide → narrow (restored on resize back)
preNarrowState: {
  showDebugMenu: boolean;
  showAboutPanel: boolean;
  minizen: boolean;
} | null
```

### Visual States

Both modes share the same 3-layout pattern:

| Concept | Wide Mode | Narrow Mode |
|---------|-----------|-------------|
| Base (most UI) | Sidebar visible | Sidebar visible |
| Middle (no sidebar) | Minizen | Default (no sidebar) |
| Focused (just editor) | Zen | Zen |

#### Wide Mode - Full (default)
```
┌─────────────┬──────────────────────┐
│  Sidebar    │  Header (date)       │ ← click header → minizen
│  - stats    │──────────────────────│
│  - entries  │                      │
│  - buttons  │  Editor              │
│             │                      │
│             │──────────────────────│
│             │  Footer (word count) │ ← click footer → zen
└─────────────┴──────────────────────┘
```

#### Wide Mode - Minizen (sidebar hidden)
```
┌────────────────────────────────────┐
│  Header (date)                     │ ← click header → full
│────────────────────────────────────│
│                                    │
│              Editor                │
│                                    │
│────────────────────────────────────│
│  Footer (word count)               │ ← click footer → zen
└────────────────────────────────────┘
```

#### Narrow Mode - Default (sidebar hidden)
```
┌────────────────────────────────────┐
│  Header (date)                     │ ← click header → show sidebar
│────────────────────────────────────│
│                                    │
│              Editor                │
│                                    │
│────────────────────────────────────│
│  Footer (word count)               │ ← click footer → zen
└────────────────────────────────────┘
```

#### Zen Mode (both wide and narrow)
```
┌────────────────────────────────────┐
│                                    │
│              Editor                │ ← ESC → restore previous state
│                                    │
└────────────────────────────────────┘
```

### State Machine (unified for both modes)

Both modes follow the same 3-layout bounce pattern: Base ↔ Middle ↔ Zen.

| From | Action | To | Notes |
|------|--------|----|-------|
| Base | header click | Middle | Wide: hide sidebar. Narrow: toggle sidebar |
| Base | footer click | Zen | Saves state to `preFocusState` |
| Middle | header click | Base | Wide: show sidebar. Narrow: toggle sidebar |
| Middle | footer click | Zen | Saves state to `preFocusState` |
| Zen (from Base) | ESC | Base | Restores full layout |
| Zen (from Middle) | ESC | Middle | Restores middle layout |

**Narrow-specific sidebar auto-close:** When sidebar is visible in narrow mode, these actions hide it and return to Default: **click editor**, **start typing**, **click overlay**. This auto-close is NOT a "commit" (doesn't clear `preNarrowState`).

**Zen remembers where you came from** via `zenFromMinizen`: if zen was entered from minizen, `exitZen()` returns to minizen (keeps `preFocusState`); if from full, restores everything.

### Resize Transitions

State preserved across resize using `preNarrowState`.

#### Wide → Narrow
- `preNarrowState` saves `{ showDebugMenu, showAboutPanel, minizen }`
- Minizen, showSidebarInNarrow reset to false; panels close; preFocusState cleared (resize absorbs focus context — the narrow transition's `preNarrowState` subsumes it)
- Zen stays zen

#### Narrow → Wide
- If `preNarrowState` exists and NOT in zen: restore panels + minizen
- If committed to narrow (user interacted with UI): start fresh as Full
- Zen stays zen

#### "Committing" to Narrow Mode

Actions that clear `preNarrowState` (commit): toggle sidebar, open/close panels, ESC to show sidebar. Actions that don't: typing, clicking editor, scrolling, selecting entries.

#### preNarrowState Consistency (IMPORTANT)

When saving to `preNarrowState` during a focus mode, save the *pre-focus* state (from `preFocusState`), not a mix. **Invariant:** `(showDebugMenu || showAboutPanel) → !minizen` — panels require sidebar visible.

```tsx
const stateToSave = preFocusState
  ? { showDebugMenu: preFocusState.showDebugMenu, showAboutPanel: preFocusState.showAboutPanel, minizen: preFocusState.minizen }
  : { showDebugMenu, showAboutPanel, minizen };
```

#### Zen Mode Purity on Resize (IMPORTANT)

Only restore from `preNarrowState` if NOT in zen. **Invariant:** `zenMode → !showDebugMenu && !showAboutPanel` (zen is always pure).

### Panel Behavior

Opening settings or about requires the sidebar:

| Before | Click settings/about | Result |
|--------|---------------------|--------|
| Wide + Full | Panel opens | Normal |
| Wide + Minizen | Exit minizen, panel opens | Sidebar appears |
| Wide + Zen | Exit zen to minizen, exit minizen, panel opens | Full state |
| Narrow + Default | Sidebar + panel appear | Sidebar overlay |
| Narrow + Sidebar Visible | Panel opens | Normal |
| Narrow + Zen | Exit zen, sidebar + panel appear | Sidebar overlay |

### Visibility Formulas

```tsx
// Sidebar visible?
const showSidebar = isNarrow
  ? showSidebarInNarrow
  : (!zenMode && !minizen);

// Header visible?
const showHeader = !zenMode;

// Footer visible?
const showFooter = !zenMode;
```

### Click Handlers Summary

| Element | Wide Mode | Narrow Mode |
|---------|-----------|-------------|
| Header | Toggle minizen | Toggle sidebar |
| Footer | Enter zen (save state) | Enter zen (save state) |
| Editor (in zen) | No click exit (ESC only) | No click exit (ESC only) |
| Sidebar area | Close panels | Close panels |
| Sidebar overlay | N/A | Close sidebar + panels |

### Code: Key Functions (Simplified)

```tsx
// Enter zen mode - save state, close panels
const enterZen = () => {
  if (minizen) {
    // From minizen: don't overwrite preFocusState (already set by enterMinizen)
    setZenFromMinizen(true);
  } else {
    // From full: save current state
    setPreFocusState({ minizen, showSidebarInNarrow, showDebugMenu, showAboutPanel });
    closePanels();
    setZenFromMinizen(false);
  }
  setZenMode(true);
};

// Exit zen mode - restore previous state
const exitZen = () => {
  setZenMode(false);
  if (zenFromMinizen) {
    // Was in minizen before zen - stay in minizen, keep preFocusState
    setZenFromMinizen(false);
  } else if (preFocusState) {
    // Was in full mode - restore everything
    setMinizen(preFocusState.minizen);
    setShowSidebarInNarrow(preFocusState.showSidebarInNarrow);
    setShowDebugMenu(preFocusState.showDebugMenu);
    setShowAboutPanel(preFocusState.showAboutPanel);
    setPreFocusState(null);
  }
};

// Enter minizen - save state, close panels
const enterMinizen = () => {
  setPreFocusState({ minizen, showSidebarInNarrow, showDebugMenu, showAboutPanel });
  setMinizen(true);
  closePanels();
};

// Exit minizen - restore previous state
const exitMinizen = () => {
  setMinizen(false);
  if (preFocusState) {
    setShowSidebarInNarrow(preFocusState.showSidebarInNarrow);
    setShowDebugMenu(preFocusState.showDebugMenu);
    setShowAboutPanel(preFocusState.showAboutPanel);
    setPreFocusState(null);
  }
};
```

See `src/hooks/useLayoutState.ts` for state machine and `src/App.tsx` for ESC handler.

### Key Principles

1. **Focus modes are fully reversible** — exiting restores exact prior state including panels
2. **Footer = zen, Header = sidebar toggle** (minizen in wide, overlay in narrow)
3. **Zen survives resize**
4. **The rule**: settings open → zen → exit zen = settings open again

**Why `preFocusState` persists but zen/minizen don't:** Zen and minizen reset on refresh (escape hatch). But `preFocusState` MUST persist so panels can be restored on refresh. When entering focus mode, panels close (written as `false` to localStorage). Without persisted `preFocusState`, the original panel state would be lost on refresh. The init IIFE reads `preFocusState`, restores panels, then clears it.

## ESC Key Behavior (IMPORTANT)

### ESC Priority (checked in order)

1. **Password flow active** → Reset flow (handled by PasswordSettings, capture phase)
2. **Scramble active (v2.4.18+)** → Unscramble only (no other ESC behavior fires). Works from editor, title input, or anywhere. In the title input, `stopPropagation()` is skipped when scrambled so the event bubbles to the App handler.
3. **Held key repeat** → Ignored (`e.repeat` returns early)
4. **User in password input** → Do nothing (only `<input>`, NOT `<textarea>`)
5. **Unwinding phase** → Resolve state top-down using state machine functions (see below)
6. **Bounce cycle** → Infinite layout cycle (only reached when neutral)

**IMPORTANT:** Scramble check comes BEFORE everything else (after password flow). This means ESC while scrambled ONLY unscrambles — it won't exit zen, close panels, or cycle.

### The ESC Philosophy (v2.5.0+)

**Tap ESC = unwind first, then bounce. Hold ESC = lock.**

ESC resolves accumulated state top-down before starting the infinite bounce cycle. Each ESC press unwinds one layer. Only once everything is neutral does the bounce cycle begin.

**Phase 1 — Unwinding** (uses `exitZen()`/`exitMinizen()`/`closePanels()`):
- Zen with saved state (`preFocusState !== null || zenFromMinizen`) → `exitZen()` restores previous state
- Minizen with saved state (`preFocusState !== null`) → `exitMinizen()` restores previous state (wide only)
- Panels open → `closePanels()`

**Phase 2 — Bounce cycle** (only reached when no saved state, no panels):

```
Wide:   base → mz → zen → mz → base → mz → zen → ...  (infinite)
Narrow: sidebar → mz → zen → mz → sidebar → mz → zen → ...  (infinite)
```

**Key discriminator:** `preFocusState !== null` (or `zenFromMinizen`) means "entered via UI, has state to restore." `null` means "entered via bounce cycle, just keep cycling."

**Example:** Full + settings open → footer → zen → ESC → settings restored (exitZen). ESC → settings closed (closePanels). ESC → bounce cycle starts (base → mz).

**Narrow direction is flipped (v2.5.0+):** In narrow mode, `escDirectionRef` semantics are opposite to wide mode. Direction resets to `'up'` on non-ESC interaction, and `'up'` at the mz junction → sidebar (toward base). This means the first ESC from narrow mz always goes toward sidebar, not zen.

**Hold-to-lock (v2.4.109+):** On ESC keydown, ESC acts instantly (no lag) AND a 500ms lock timer starts. Before acting, a full snapshot of layout state is saved to `escPreCycleRef` (includes panels, preFocusState, zenFromMinizen). On keyup (tap), the timer is cancelled and the snapshot cleared — the action sticks. If the timer fires before keyup (hold), the snapshot is restored (reverting the action), then the app locks. Only active when `auth.hasPassword`.

**Direction tracking:** `escDirectionRef` (`'up' | 'down'`). Starts `'up'`, reset to `'up'` by any non-ESC interaction (keydown, mousedown, resize). In wide mode: `'up'` = toward zen, `'down'` = toward base. In narrow mode: `'up'` = toward sidebar, `'down'` = toward zen.

### Ref Pattern for Layout State in ESC Handler

The ESC handler uses refs to track `zenMode` and `minizen` to avoid stale closure issues:

```tsx
// Refs in useLayoutState.ts (always current)
const zenModeRef = useRef(zenMode);
useEffect(() => { zenModeRef.current = zenMode; }, [zenMode]);
const minizenRef = useRef(minizen);
useEffect(() => { minizenRef.current = minizen; }, [minizen]);

// Direction, lock timer, and pre-cycle snapshot in App.tsx
const escDirectionRef = useRef<'up' | 'down'>('up');
const escLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const escPreCycleRef = useRef<{
  zenMode, minizen, showSidebarInNarrow,
  showDebugMenu, showAboutPanel, preFocusState, zenFromMinizen,
  direction
} | null>(null);
```

Direction ref is reset by global keydown/mousedown/resize listeners (any non-ESC interaction). Lock timer and pre-cycle snapshot are both cleared on keyup.

**Pre-lock save (v2.4.21+):** Before locking (in the hold timer callback), saves editor content via `saveEntry()` — but **only if `auth.hasPassword`**. Without this guard, ESC on a fresh journal would persist an empty placeholder to IndexedDB.

## Font Sizes

| Name | Size | Class | Elements |
|------|------|-------|----------|
| **title** | 24px | `text-2xl font-extrabold` | "good days" title, lock screen top-left |
| **heading** | 18px | `text-lg font-extrabold` | Date header ("jan 30, 2025") |
| **body** | 16px | `text-base font-bold` | Editor text, placeholder, about panel |
| **label** | 14px | inline `fontSize: '14px'` | Sidebar buttons, entry dates, footer, "started at" |
| **caption** | 12px | `text-xs font-bold` | Stats, settings controls, password inputs, presets |

### "started at" Time Display (v2.1.29+)

The entry header shows "started at HH:MM" by default. Seconds are only shown when the poweruser menu is open (`stacked` prop = `showDebugMenu && showAboutPanel`), displaying "started at HH:MM:SS". Works in both 12-hour and 24-hour formats.

**Time format sync (v2.4.29+):** `EntryHeader` listens for a `timeFormatChange` custom event (dispatched by `TimeDisplay` when the user toggles 12h/24h) plus the standard `storage` event (for cross-tab sync). Previously used a 100ms `setInterval` poll for same-tab changes — replaced with the custom event for instant, zero-overhead reactivity.

Code location: `src/features/journal/components/EntryHeader.tsx`

### Lowercase am/pm (v2.5.28+)

All time displays use lowercase `am`/`pm`. This applies to: entry header ("started at"), sidebar dates, `\time` command, live clock, and import merge separators. Enforced via `.toLowerCase()` on `toLocaleTimeString()` calls and lowercase literals in custom formatters.

### Poweruser Sidebar Date Format (v2.5.29+)

In poweruser mode, sidebar entries with `startedAt` show the standard `formatDate()` output with time appended: `"feb 15, 2025, 9:24 am"`, `"today, 9:24 am"`, `"yesterday, 3:15 pm"`. Previously used numeric date format (`"2/15/2025 9:24 am"`).

Code location: `src/features/journal/components/EntrySidebar.tsx`

## Button Sizes

| Name | Size Prop | Font | Weight | Usage |
|------|-----------|------|--------|-------|
| **button-primary** | (none) | 14px | `font-extrabold` | Sidebar buttons (scramble, settings, about) |
| **button-secondary** | `size="sm"` | 12px | `font-bold` | Settings panel controls, password buttons |

All buttons use `px-3 py-2` padding and `font-mono`.

### Quick Reference

```
"Make this title size"       → 24px, text-2xl, font-extrabold
"Make this heading size"     → 18px, text-lg, font-extrabold
"Make this body size"        → 16px, text-base, font-bold
"Make this label size"       → 14px, inline style, font-extrabold
"Make this caption size"     → 12px, text-xs, font-bold
"Use button-primary"         → FunctionButton (default)
"Use button-secondary"       → FunctionButton size="sm"
```

## Buttons (IMPORTANT)

**ALWAYS use the `FunctionButton` component** for all clickable buttons. Never create inline buttons with custom hover/click handlers.

### Split Buttons (inline exceptions)

Three components use inline split buttons instead of `FunctionButton` — they need shared-edge borders (3px outer, 1px inner) that `FunctionButton` doesn't support:

| Component | Buttons | File |
|-----------|---------|------|
| `TimeButton` | 12h / 24h toggle | `TimeDisplay.tsx` |
| `PasswordButton` | change / remove password | `PasswordSettings.tsx` |
| Color stats button | copy / paste | `StatsDisplay.tsx` |

**mouseLeave must clear isClicked (v2.6.31+).** All split buttons track `isClicked` (mouseDown/mouseUp) for the active border color. If the user mousedowns then drags off the button, `mouseUp` fires on whatever element the cursor is over — not the original button. Without clearing `isClicked` on `mouseLeave`, the button stays visually stuck in the pressed state. Pattern:

```tsx
onMouseLeave={() => { setIsHovered(false); setIsClicked(false); }}
```

### Usage

```tsx
import { FunctionButton } from '@shared/components';

// Basic button
<FunctionButton onClick={handleClick}>
  <span>button text</span>
</FunctionButton>

// With icon
<FunctionButton onClick={handleClick} size="sm">
  <Icon className="w-3 h-3" />
  <span>button text</span>
</FunctionButton>

// Active state (for toggles)
<FunctionButton onClick={handleClick} isActive={isActive}>
  <span>toggle button</span>
</FunctionButton>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `onClick` | `() => void` | Click handler (required) |
| `disabled` | `boolean` | Disables the button |
| `isActive` | `boolean` | Shows active/selected state |
| `size` | `'sm' \| 'default'` | `'sm'` for settings panels, `'default'` for sidebar |
| `fullWidth` | `boolean` | Whether button fills container width (default: `true`) |
| `children` | `ReactNode` | Button content (text, icons) |

### The Hover Flicker Problem

**The problem:** When button text changes on hover, the button resizes. If it shrinks, the cursor may land outside the new boundary, triggering mouseLeave, which reverts the text, the button grows, cursor is inside again — infinite flicker. If it grows, the hover tracking zone (anchored to the old size) may falsely detect an exit when the cursor moves into the expanded area.

**Key insight:** This is a LINE COUNT problem, not a character count problem. The same text might fit on one line when the app is wide, but wrap to two lines when narrow.

**Pattern name:** We call this **"stable hover"** — the hover hitbox stays stable while the button can visually change.

#### Stable Hover Formalization (v2.4.97+)

**Frame 1** = default state (no hover). **Frame 2** = hover state.

**Core rule:** On hover enter, the exit hitbox expands to `max(Frame 1 rect, current container rect)`. On hover exit, the hitbox returns to Frame 1's natural size. The visual button always matches its current content — only the invisible exit zone is enlarged.

**Why not always max?** If the hitbox were permanently max, and Frame 2 is larger than Frame 1, there would be an invisible hover zone extending beyond the visible idle button — hovering over nothing would activate the button. The expansion is a one-directional safety net that only activates once you're already interacting.

**State machine:**
```
IDLE
  hitbox = Frame 1 natural size (what you see is what you hit)
  ↓ mouseenter (must reach the real visible button)

HOVERED
  visual = Frame 2 (natural size, may be bigger or smaller)
  hitbox = max(Frame 1 rect, current container rect)
  global mousemove is SOLE AUTHORITY on hover state
  mouseEnter/mouseLeave are COMPLETELY IGNORED
  ↓ mousemove outside hitbox, OR window resize, OR document leave

IDLE
  hitbox = Frame 1 natural size (reset)
  lockedRect cleared → next mouseEnter starts fresh
```

**Handles both directions:**
- **Frame 2 smaller** (button shrinks): Entry rect is larger → cursor stays in safe zone → no flicker
- **Frame 2 larger** (button grows): Current rect is larger → cursor can roam expanded area → no false exit

#### Architecture: Sole Authority Pattern (v2.4.126+)

The stable hover system has two phases with strict ownership:

**Phase 1 — Entry (mouseEnter handler):**
- Only fires on initial entry (when `lockedRect` is null)
- Captures `lockedRect` = button's bounding rect BEFORE React re-renders
- Sets `isHovered = true` → React renders `hoverChildren` → button may resize
- After this point, `mouseEnter` is dead — the `if (lockedRect.current) return` guard blocks all re-entry events

**Phase 2 — Tracking (global mousemove effect):**
- Activated by `isHovered === true && hoverChildren !== undefined`
- Computes exit zone on every mouse move: `max(lockedRect, live button rect) + 3px buffer`
- If cursor is outside exit zone → unhover (clears `lockedRect`, sets `isHovered = false`)
- Also listens for `document.documentElement` mouseleave (cursor left the page)
- **This is the ONLY thing that can end a hover cycle.** Not mouseLeave, not mouseEnter, not anything else.

**Phase 3 — Exit (unhover):**
- `lockedRect.current = null` → next mouseEnter can fire again (Phase 1)
- `isHovered = false` → React renders `children` → button restores original size
- Effect cleanup removes global listeners

```
mouseEnter ──→ capture lockedRect ──→ isHovered=true ──→ global mousemove takes over
                                                              │
                                                              ├── cursor inside exit zone → do nothing
                                                              ├── cursor outside exit zone → UNHOVER
                                                              ├── cursor leaves page → UNHOVER
                                                              └── window resize → UNHOVER
```

#### The lockedRect Overwrite Bug (Root Cause of Flicker)

**THIS IS THE BUG THAT TOOK THE LONGEST TO FIND. Read carefully.**

**Scenario (before fix):**
1. Cursor enters button → `lockedRect` captures Frame 1 rect (e.g., bottom = 466)
2. `isHovered = true` → button renders `hoverChildren` → button shrinks (e.g., bottom = 450)
3. Cursor drifts into the gap (y = 455, between live bottom 450 and locked bottom 466)
4. Cursor is OUTSIDE the shrunken button → browser fires `mouseLeave` then `mouseEnter` as cursor re-enters
5. **BUG:** `mouseEnter` handler captures NEW `lockedRect` = shrunken button rect (bottom = 450)
6. Exit zone shrinks to the smaller rect → cursor at y = 455 is now OUTSIDE → unhover → flicker

**The fix:**
```tsx
const handleMouseEnter = useCallback(() => {
  if (disabled) return;
  if (hoverChildren !== undefined) {
    // Already in a hover cycle — ignore. Global mousemove owns hover state.
    if (lockedRect.current) return;  // ← THIS LINE PREVENTS THE BUG
    if (buttonRef.current) {
      lockedRect.current = buttonRef.current.getBoundingClientRect();
    }
  }
  setIsHovered(true);
}, [disabled, hoverChildren]);
```

**Why it works:** Once `lockedRect` is captured, it is NEVER overwritten until `unhover()` clears it to null. The browser can fire as many mouseEnter/mouseLeave events as it wants during a hover cycle — they are all no-ops. Only the global mousemove can end the cycle.

**The mouseLeave handler:**
```tsx
const handleMouseLeave = useCallback(() => {
  if (hoverChildren !== undefined) {
    return;  // ← Complete no-op. Global mousemove owns exit.
  }
  // Only used for normal buttons (no hoverChildren)
  setIsHovered(false);
  setIsClicked(false);
}, [hoverChildren]);
```

#### Invariants (NEVER VIOLATE THESE)

1. **`lockedRect` is write-once per hover cycle.** Set in `handleMouseEnter` (Phase 1), cleared only in `unhover()` (Phase 3). Never overwritten in between.
2. **Global mousemove is the sole authority.** During a hover cycle, NOTHING else can change `isHovered`. Not mouseEnter, not mouseLeave, not any other event.
3. **mouseEnter is blocked during active hover.** The `if (lockedRect.current) return` guard ensures re-entry events from the shrunken button are completely ignored.
4. **mouseLeave is always a no-op** when `hoverChildren` is present. Full stop.
5. **Content and size change atomically.** Both driven by `isHovered` state → same React render → same paint. There is no frame where the button has resized but still shows old content.
6. **Exit zone only grows, never shrinks** during a hover cycle. `max(lockedRect, liveRect)` ensures the zone covers both the entry size and the current size.
7. **No timers, no cooldowns, no debouncing.** The system is purely coordinate-based. If cursor is inside → hovered. If outside → not hovered. Instant, deterministic.

#### Solution: `hoverChildren` Prop on FunctionButton

Pass `hoverChildren` to `FunctionButton` when button content should change on hover. The stable hover coordinate logic is built into the button itself — no wrapper div needed.

```tsx
<FunctionButton
  onClick={handleClick}
  hoverChildren={<span>hover text</span>}
>
  <span>default text</span>
</FunctionButton>
```

**Implementation details:**
- When `hoverChildren` is provided, a ref is attached to the `<button>` element
- On initial entry: captures bounding rect (Frame 1) before any state change. All subsequent mouseEnter events are blocked.
- `getExitRect()`: computes `max(entry rect, live button rect)` — the exit zone
- mouseLeave: complete no-op (returns immediately)
- Global `mousemove` listener (only while hovered + `hoverChildren` present): sole authority on exit detection
- `document.documentElement` `mouseleave` listener: handles cursor leaving the page (no more mousemove events)
- Window resize while hovered: clean unhover + rect reset (viewport positions are stale)
- **Border buffer**: `isInsideRect` adds a 3px buffer to the rect check, matching the FunctionButton `3px solid` border. Without this, cursor positions at the exact border edge oscillate in/out.
- When `hoverChildren` is NOT provided, the button uses simple `onMouseEnter`/`onMouseLeave` with no overhead

**Edge cases:**
- Scrolling while hovering: captured rect becomes stale relative to viewport. Cursor will "exit" even if visually over button. Acceptable — scrolling while hovering is unusual.
- Window resize while hovering: `lockedRect` cleared, clean unhover. No stale rects.
- Cursor leaves page: `documentElement` mouseleave fires unhover. No orphaned hover state.

**Key advantage:** Border/background hover state and text content hover state are always in sync — both driven by the same `isHovered` state inside the button.

Code locations:
- Component: `src/shared/components/FunctionButton.tsx`
- Scramble hotkey button: `src/features/settings/components/SettingsPanel.tsx`
- Import button: `src/features/export/components/ExportButtons.tsx`

#### Title Hover (useLayoutState.ts)

The "good days" title in the header uses the same entry-first principle but with a different mechanism (coordinate detection via `mousemove`/`mouseover` on `document`, not a button component). The title area changes content on hover (shows version + pairing code when about panel is open).

**Entry-first principle:**
- When NOT hovered: use the live rect for entry detection. Cursor must reach the visible title to trigger hover.
- When hovered: `titleMaxHeight` grows via `Math.max(current, rect.height)` so the exit zone never shrinks during a hover cycle.
- On unhover: `titleMaxHeight` resets to 0 — next entry requires reaching the visible title again.
- On `showAboutPanel` change: reset `titleMaxHeight` and unhover (content flips between modes, old max height is stale).

Code location: `src/hooks/useLayoutState.ts` (title hover effect + showAboutPanel reset effect)

#### Solution 2: Grid Overlay (UI Swap, No Visual Shrink)

Use when swapping between two completely different UIs and you want consistent sizing (no visual shrink).

```
┌─────────────────────────┐  ← container (sized to fit BOTH)
│  copy | paste           │  ← visible when hovered
│  txt: #78cc33           │  ← visible when NOT hovered (same space)
└─────────────────────────┘
```

```tsx
<div
  style={{ display: 'grid' }}
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
>
  {/* Both elements in same grid cell - container sizes to larger one */}
  <div style={{ gridRow: 1, gridColumn: 1, visibility: hovered ? 'visible' : 'hidden' }}>
    {/* Hover content */}
  </div>
  <div style={{ gridRow: 1, gridColumn: 1, visibility: hovered ? 'hidden' : 'visible' }}>
    {/* Default content */}
  </div>
</div>
```

Code location: `src/features/statistics/components/StatsDisplay.tsx` (color stats copy/paste)

#### When to Use Which

| Scenario | Solution |
|----------|----------|
| Button text changes on hover (any direction) | `hoverChildren` prop on `FunctionButton` |
| Title/header area with content swap on hover | Entry-first coordinate detection (`useLayoutState.ts`) |
| Swapping between different UIs, want consistent size | Grid Overlay |
| Copy/paste buttons replacing stats display | Grid Overlay |

#### Debugging Hover Issues

If hover flicker reappears, check these in order:

1. **Is `lockedRect` being overwritten?** The `if (lockedRect.current) return` guard in `handleMouseEnter` MUST be present. If removed, the bug returns immediately.
2. **Is mouseLeave doing anything?** When `hoverChildren` is present, mouseLeave MUST be a complete no-op (just `return`). Any state changes in mouseLeave will fight with the global mousemove.
3. **Is the exit zone correct?** `getExitRect` must return `max(lockedRect, liveRect)`. If it only returns one or the other, one direction of size change will flicker.
4. **Is the 3px buffer present?** `isInsideRect` needs the buffer to account for the button's `3px solid` border. Without it, the border strip flickers.
5. **Add debug overlays** to visualize: set `const DEBUG_HOVER = true` at the top of `FunctionButton.tsx`, add a `debugState` useState, render colored rect overlays via `createPortal` to `document.body`. Red dashed = lockedRect, blue solid = exit zone, green dotted = live button rect. Include a state readout panel (position: fixed, bottom-left) showing `isHovered`, `lastEvent`, `cursorPos`, `insideExit`, and all three rects. **Strip all debug code before pushing.**


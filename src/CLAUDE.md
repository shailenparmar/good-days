# Claude Code Instructions — Source

## UI Conventions

- All scrollable areas should use `scrollbar-hide` class to hide scrollbars
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

Scroll positions persist across page refresh for all scrollable panels:

| Panel | Storage Key | Restore Timing |
|-------|-------------|----------------|
| Settings | `settingsScrollTop` | On mount |
| About | `aboutScrollTop` | On mount |
| Editor | `scrollPosition:{date}` | After content loads (double rAF) |

**Implementation:**
- Settings/About: Direct localStorage read/write with debounced save (100ms)
- Editor: Uses `useKeyedPersisted` hook for per-date scroll positions
- Editor needs double `requestAnimationFrame` to ensure content is rendered before restoring scroll

```typescript
// Editor scroll restore (after content loads)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (editorRef.current) {
      editorRef.current.scrollTop = savedScrollTop;
    }
  });
});
```

**Inline text replacement scroll preservation:**
- The `\time` command replaces text inline, which can cause the browser to jump scroll position after React re-renders
- Before replacement, `scrollTop` is captured and restored in the same `requestAnimationFrame` that sets cursor position
- This works across all modes (zen, minizen, scramble, settings open) because the textarea DOM element is the same in all modes

Code locations:
- `src/features/settings/components/SettingsPanel.tsx`
- `src/features/settings/components/AboutPanel.tsx`
- `src/features/journal/components/JournalEditor.tsx`

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

3. **WebSyncBridge (streaming, v2.4.9):** The rAF callback calls `setLivePreset()` + `applyPreset()` to update React state (capped at 60fps). React state is always current, so ColorPicker indicators, save-preset, and all consumers work correctly. The ThemeContext CSS var sync effect fires after each render to update CSS variables. Inline styles referencing CSS vars (`hsl(var(--h), ...)`) are static strings, so React's DOM diffing skips attribute writes.

   **Previous approach (v2.4.6-v2.4.8):** Set CSS vars directly in the rAF callback, bypassing React entirely. This caused ColorPicker indicators to freeze during streaming (React state was stale) and required complex disconnect sync-back and save-preset pre-sync logic. Reverted in v2.4.9 for simplicity.

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

## Screen Copy Approval Policy

**All user-facing copy and screens must be approved by the user.** Do not add new text screens without approval. Currently approved:
- "something went wrong" (error boundary) — DEFAULT_PRESET_1 colors (dark green text on light yellow bg)

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
| About panel shrinks | Width goes from 675px → 400px |
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
| About (alone) | 720px | Includes 6px right border |
| About (stacked) | 400px | Includes 6px right border |

### Right Edge Alignment (IMPORTANT)

The About panel's right edge stays at the **same horizontal position** whether in About-only mode or poweruser mode.

#### The Math

Tailwind uses `box-sizing: border-box` globally, meaning **borders are inside the width**, not added to it.

```
About-only mode:
  Sidebar (320px) + About (720px) = 1040px right edge

Poweruser mode:
  Sidebar (320px) + Settings (320px) + About (400px) = 1040px right edge
```

Both modes have the same right edge position (1040px from viewport left).

#### Implementation

Constants in `AboutPanel.tsx`:

```tsx
// Widths INCLUDE the 6px border (border-box sizing)
const ABOUT_WIDTH = 720;    // About panel width when alone
const SETTINGS_WIDTH = 320; // Settings panel width (w-80)

const aboutWidth = stacked
  ? ABOUT_WIDTH - SETTINGS_WIDTH  // 720 - 320 = 400px
  : ABOUT_WIDTH;                   // 720px
```

#### Common Mistake

Don't add border width separately! With `border-box`:
- ❌ `720 - 320 - 6 = 394px` (wrong - double-counts border)
- ✅ `720 - 320 = 400px` (correct - border already in width)

#### To Change Panel Widths

1. Update `ABOUT_WIDTH` in `AboutPanel.tsx` to change About panel size
2. The stacked width auto-calculates: `ABOUT_WIDTH - SETTINGS_WIDTH`
3. If Settings width changes, update `SETTINGS_WIDTH` constant

The right edge will stay aligned regardless of content changes.

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

The signature placeholder animation where text sweeps bold left-to-right, then unbolds left-to-right.

### Visual Effect

```
Phase 1 (bold):     Phase 2 (unbold):
s                   start typing        (all bold)
st                  start typing        (s normal, rest bold)
sta                 start typing        (st normal, rest bold)
star                start typing
start               start typing
start               start typing
start t             start typing
start ty            start typing
start typ           start typing
start typi          start typing
start typin         start typing
start typing        start typing        (all normal)
```

### Implementation

Two state variables drive the animation:

```tsx
const [boldCount, setBoldCount] = useState(0);
const [animPhase, setAnimPhase] = useState<'bold' | 'unbold'>('bold');
```

**Timer:** Increments `boldCount` every **83ms** (~12 characters/second)

**Phase flip:** When `boldCount` reaches text length, phase toggles and count resets

**Rendering:**
```tsx
{animPhase === 'bold' ? (
  <>
    <span className="font-bold">{text.slice(0, boldCount)}</span>
    <span>{text.slice(boldCount)}</span>
  </>
) : (
  <>
    <span>{text.slice(0, boldCount)}</span>
    <span className="font-bold">{text.slice(boldCount)}</span>
  </>
)}
```

### Where It's Used

| Location | Text | File |
|----------|------|------|
| Editor placeholder | "start typing" | `JournalEditor.tsx` |
| Lock screen | "password" | `LockScreen.tsx` |
| Password settings | varies ("password", "old password", etc.) | `PasswordSettings.tsx` |
| Preset keyboard hint | "use arrow keys..." | `PresetGrid.tsx` |

### Timing

- **83ms per character** = ~12 chars/second
- Full cycle for "start typing" (12 chars): ~2 seconds (1s bold sweep + 1s unbold sweep)

### Reset Behavior

Animation resets (`boldCount = 0`, `animPhase = 'bold'`) when:
- Placeholder becomes visible (e.g., input cleared)
- Component mounts

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

### State Lifecycle

#### `preFocusState`

| Action | Effect |
|--------|--------|
| `enterMinizen()` | Set to current state, then close panels |
| `exitMinizen()` | Restore from it, then set to `null` |
| `enterZen()` (not from minizen) | Set to current state, then close panels |
| `exitZen()` (not from minizen) | Restore from it, then set to `null` |
| `enterZen()` (from minizen) | Don't overwrite (already set by enterMinizen) |
| `exitZen()` (from minizen) | Don't clear (still needed for exitMinizen) |
| Resize wide → narrow | Set to `null` (focus state cleared) |

#### `preNarrowState`

| Action | Effect |
|--------|--------|
| Resize wide → narrow | Set to `{ showDebugMenu, showAboutPanel, minizen }` |
| Resize narrow → wide | Restore from it, then set to `null` |
| **Commit actions in narrow:** | Set to `null` (user committed to narrow) |
| - Toggle sidebar (header click) | |
| - Open/close panel buttons | |
| **Non-commit actions:** | No effect (preNarrowState preserved) |
| - Typing | |
| - Click in editor | |
| - Select entry | |

#### `zenFromMinizen`

Tracks whether zen was entered from minizen. This matters because:
- If zen entered from minizen: `preFocusState` was set by `enterMinizen()`, not `enterZen()`
- On `exitZen()`: if `zenFromMinizen`, just exit zen (stay in minizen, keep preFocusState)
- On `exitZen()`: if NOT `zenFromMinizen`, restore preFocusState fully

| Action | Effect |
|--------|--------|
| `enterZen()` from minizen | Set to `true` |
| `enterZen()` not from minizen | Set to `false` |
| `exitZen()` | Set to `false` |
| Resize wide → narrow | Set to `false` |

### Visual States

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

#### Wide Mode - Zen (just editor)
```
┌────────────────────────────────────┐
│                                    │
│              Editor                │ ← ESC → restore previous state
│                                    │
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

#### Narrow Mode - Sidebar Visible
```
┌─────────────┬──────────────────────┐
│  Sidebar    │  Header (date)       │ ← click header → hide sidebar
│  (overlay)  │──────────────────────│
│             │                      │
│             │  Editor              │
│             │                      │
│             │──────────────────────│
│             │  Footer (word count) │ ← click footer → zen
└─────────────┴──────────────────────┘
```

#### Narrow Mode - Zen (just editor)
```
┌────────────────────────────────────┐
│                                    │
│              Editor                │ ← ESC → restore previous state
│                                    │
└────────────────────────────────────┘
```

### State Machine - Wide Mode

```
                    ┌─────────────────┐
       header click │                 │ header click
            ┌───────┤      FULL       ├───────┐
            │       │                 │       │
            ▼       └────────┬────────┘       │
    ┌───────────────┐        │                │
    │    MINIZEN    │        │ footer click   │
    │               │        │   (save: full) │
    └───────┬───────┘        │                │
            │                ▼                │
            │ footer    ┌─────────┐           │
            │ click     │   ZEN   │───────────┘
            │(save:mini)│         │  ESC/click = restore saved state
            └──────────►└─────────┘
```

**Zen remembers where you came from:**

| Current State | Action | Next State | `preFocusState` |
|---------------|--------|------------|---------------|
| Full | footer click | Zen | saves "full" |
| Minizen | footer click | Zen | saves "minizen" |
| Zen | ESC/click | (restore) | restores saved state |

| Current State | Action | Next State | What Changes |
|---------------|--------|------------|--------------|
| Full | header click | Minizen | Sidebar hides |
| Full | footer click | Zen | Sidebar + header + footer hide, save "full" |
| Minizen | header click | Full | Sidebar shows |
| Minizen | footer click | Zen | Header + footer hide, save "minizen" |
| Zen (from Full) | ESC/click | Full | Restore full layout |
| Zen (from Minizen) | ESC/click | Minizen | Restore minizen layout |

### State Machine - Narrow Mode

```
                    ┌──────────────────┐
       header click │     SIDEBAR      │ header click
            ┌───────┤     VISIBLE      ├───────┐
            │       │                  │       │
            ▼       └────────┬─────────┘       │
    ┌────────────────┐       │                 │
    │    DEFAULT     │       │ footer click    │
    │ (sidebar hidden)       │ (save: visible) │
    └───────┬────────┘       │                 │
            │                ▼                 │
            │ footer    ┌─────────┐            │
            │ click     │   ZEN   │────────────┘
            │(save:def) │         │  ESC/click = restore saved state
            └──────────►└─────────┘
```

**Zen remembers where you came from:**

| Current State | Action | Next State | `preFocusState` |
|---------------|--------|------------|---------------|
| Default | footer click | Zen | saves "default" |
| Sidebar Visible | footer click | Zen | saves "sidebar-visible" |
| Zen | ESC/click | (restore) | restores saved state |

| Current State | Action | Next State | What Changes |
|---------------|--------|------------|--------------|
| Default (no sidebar) | header click | Sidebar Visible | Sidebar overlay appears |
| Default (no sidebar) | ESC | Sidebar Visible | Sidebar overlay appears |
| Default (no sidebar) | footer click | Zen | Header + footer hide, save "default" |
| Sidebar Visible | header click | Default | Sidebar hides |
| Sidebar Visible | click editor | Default | Sidebar hides, focus editor |
| Sidebar Visible | start typing | Default | Sidebar hides, focus editor |
| Sidebar Visible | click overlay | Default | Sidebar hides |
| Sidebar Visible | footer click | Zen | Sidebar + header + footer hide, save "visible" |
| Sidebar Visible | ESC | Lock | Locks app |
| Zen (from Default) | ESC/click | Default | Restore default (no sidebar) |
| Zen (from Visible) | ESC/click | Sidebar Visible | Restore sidebar overlay |

### ESC Key Priority

ESC checks are evaluated in this order:

1. **Password flow active** → Reset flow (handled by PasswordSettings, capture phase)
2. **Scramble active** → Unscramble only
3. **User in `<input>`** → Do nothing (NOT `<textarea>`)
4. **Narrow mode** → bounce cycle (see below)
5. **Wide mode** → bounce cycle (see below)

**ESC bounce cycle (v2.4.22+, updated v2.4.24, narrow mode v2.4.40+):**

Both modes use the same bounce principle: you must see all 3 layouts before ESC can lock. A `visitedZen` flag (ref, default `false`) tracks whether zen has been visited in the current ESC sequence. Any non-ESC interaction (keypress or click) resets the flag — the cycle always starts fresh.

**State mapping between modes:**

| Concept | Wide Mode | Narrow Mode |
|---------|-----------|-------------|
| Base (most UI) | Sidebar visible | Sidebar visible |
| Middle (no sidebar) | Minizen | Default (no sidebar) |
| Focused (just editor) | Zen | Zen |

```
ESC press (wide mode):
  [panels open]            → closePanels + exit zen/mz → base, visitedZen=false
  [zen]                    → mz, visitedZen=true
  [mz + !visitedZen]       → zen (going up)
  [mz + visitedZen]        → base (coming down)
  [base + visitedZen + pw] → save + lock
  [base + visitedZen + !pw]→ mz, visitedZen=false (restart)
  [base + !visitedZen]     → mz (always go up first, never lock)

ESC press (narrow mode):
  [panels open]            → closePanels → sidebar visible (base), visitedZen=false
  [zen]                    → default (no sidebar), visitedZen=true
  [default + !visitedZen]  → zen (going up)
  [default + visitedZen]   → sidebar visible (coming down)
  [sidebar + visitedZen + pw]  → save + lock
  [sidebar + visitedZen + !pw] → default, visitedZen=false (restart)
  [sidebar + !visitedZen]  → default (always go up first, never lock)
```

**Example sequences (both modes, with password):**
- From base/sidebar: 5 presses to lock
- From mz/default: 4 presses to lock
- From zen: 3 presses to lock
- No password: loops forever

**Cycle reset:** `escVisitedZenRef` resets to `false` on any non-ESC keydown, mousedown, or window resize (global listeners in a separate `useEffect`). This means typing, clicking, resizing, or any other interaction breaks the ESC sequence — the next ESC from base always starts the full cycle.

**Both modes use raw setters** (`setZenMode`/`setMinizen`/`setShowSidebarInNarrow`) instead of `enterZen`/`exitZen` to bypass `preFocusState` restoration. `preFocusState` and `zenFromMinizen` are cleared on panels→base and zen→middle transitions.

### Resize Transitions

State is preserved across resize using `preNarrowState`. Resizing to narrow "agrees to the narrow experience" but preserves your wide-mode intent for when you resize back.

#### Wide → Narrow

| Before | After | Reason |
|--------|-------|--------|
| Full | Default | Sidebar becomes overlay-style in narrow |
| Minizen | Default | Same visual (no sidebar, has header+footer) |
| Zen | Zen | Stay in zen |
| Panels open | Panels closed (saved) | No room, but state saved for restore |

**State changes:**
- `preNarrowState` saves `{ showDebugMenu, showAboutPanel, minizen }`
- `minizen = false` (reset)
- `showSidebarInNarrow = false` (reset)
- `closePanels()` (close settings/about)
- `preFocusState = null` (clear focus mode state)
- `zenMode` preserved (if in zen, stay in zen)

#### Narrow → Wide

| Before | After | Reason |
|--------|-------|--------|
| Default (not committed) | Restore saved state | Panels + minizen restored from preNarrowState |
| Default (committed) | Full | User interacted in narrow, start fresh |
| Sidebar Visible | Full or Minizen | Depends on preNarrowState |
| Zen | Zen | Stay in zen |

**State changes:**
- `preNarrowState` restored → panels AND minizen restored if saved
- `showSidebarInNarrow = false` (reset)
- `zenMode` preserved (if in zen, stay in zen)

#### "Committing" to Narrow Mode

Certain interactions in narrow mode clear `preNarrowState`, meaning you've committed to the narrow experience and won't restore wide-mode state on resize back.

**Actions that commit (clear `preNarrowState`):**
- Toggle sidebar (header click)
- Open/close panel buttons
- ESC to show sidebar (v2.3.17)

**Actions that DON'T commit:**
- Typing (content creation)
- Click in editor
- Scrolling
- Selecting an entry

This distinction matters: typing and clicking to focus are about **content**, not **UI navigation**. You shouldn't lose your wide-mode state just because you typed something while narrow.

#### preNarrowState Consistency (IMPORTANT)

When saving to `preNarrowState`, the saved state must be internally consistent. Panels require the sidebar to be visible, and minizen hides the sidebar. Therefore: **if panels are open, minizen must be false**.

**The edge case:**

If you're in a focus mode (minizen) when resizing to narrow, the app must save the *pre-focus* state, not a mix of pre-focus panels with current minizen.

**Bug scenario (fixed in v1.9.3):**
1. Wide mode, settings open (minizen=false)
2. Click header → enter minizen (saves panels to `preFocusState`, sets minizen=true, closes panels)
3. Resize to narrow → if we saved `{ showDebugMenu: preFocusState.showDebugMenu, minizen: minizen }` we'd get `{ showDebugMenu: true, minizen: true }` (inconsistent!)
4. Resize back to wide → settings panel visible but no sidebar (minizen=true)

**The fix:**

When `preFocusState` exists, save the entire pre-focus state consistently:

```tsx
const stateToSave = preFocusState
  ? { showDebugMenu: preFocusState.showDebugMenu, showAboutPanel: preFocusState.showAboutPanel, minizen: preFocusState.minizen }
  : { showDebugMenu, showAboutPanel, minizen };
```

**The invariant:** Saved state must always satisfy: `(showDebugMenu || showAboutPanel) → !minizen`

#### Zen Mode Purity on Resize (IMPORTANT)

When restoring from `preNarrowState` on narrow→wide resize, we must NOT restore panels if currently in zen mode. Zen should be pure - just the editor, no panels.

**Bug scenario (fixed in v1.9.4):**
1. Wide mode, settings open
2. Resize to narrow → `preNarrowState = { showDebugMenu: true, ... }`, panels close
3. Enter zen in narrow (click footer)
4. Resize back to wide → if we restored `preNarrowState`, settings panel would appear while in zen!
5. Result: zen mode with floating settings panel (should be just editor)

**The fix:**

Only restore from `preNarrowState` if NOT in zen mode:

```tsx
} else if (!narrow && wasNarrow) {
  // Narrow → Wide: restore state if not committed AND not in zen
  if (preNarrowState && !zenMode) {
    setShowDebugMenu(preNarrowState.showDebugMenu);
    setShowAboutPanel(preNarrowState.showAboutPanel);
    setMinizen(preNarrowState.minizen);
    setPreNarrowState(null);
  }
  setShowSidebarInNarrow(false);
}
```

**The invariant:** `zenMode → !showDebugMenu && !showAboutPanel` (zen is always pure)

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

1. **Focus modes are fully reversible** - Exiting any focus mode restores the exact prior state, including open panels
2. **Footer = zen toggle** - Footer click enters/exits zen in both modes
3. **Header = sidebar toggle** - Header click toggles sidebar visibility (minizen in wide, overlay in narrow)
4. **Zen survives resize** - If in zen, stay in zen across breakpoint
5. **`preFocusState` captures full context** - See "State Lifecycle" section above for details

**The rule**: If settings was open → zen → exit zen = settings open again. Same for minizen.

### Persistence Framework (v1.10.19+)

The layout state system has three domains with different persistence rules.

#### Three State Domains

| Domain | Variables | Persisted? | Rationale |
|--------|-----------|------------|-----------|
| **Focus** | `zenMode`, `minizen` | **No** (v1.10.37+) | Ephemeral focus states; refresh = escape hatch |
| **Width** | `isNarrow` | No (computed) | Determined by current window size |
| **Panels** | `showDebugMenu`, `showAboutPanel` | Yes | User opened these; should survive close/reopen |

#### Restoration Ticket Pattern

`preFocusState` and `preNarrowState` are "restoration tickets" — snapshots of state saved before a transition so the reverse transition can restore it.

**Persistence rule for tickets:** `preFocusState` persists so that panel state can be restored on refresh from a focus mode. `preNarrowState` does not persist (resize context is session-bound).

| Ticket | Restores from... | That state persists? | Ticket persists? |
|--------|-------------------|---------------------|-----------------|
| `preFocusState` | Focus modes (zen/minizen) | No (v1.10.37+) | **Yes** (for panel restoration on refresh) |
| `preNarrowState` | Narrow layout (resize) | No (computed) | **No** |

**Why `preFocusState` still persists (v1.10.37+):** Even though zen/minizen no longer persist, `preFocusState` must persist so panels can be restored on refresh. When entering a focus mode, panels are closed (written as `false` to localStorage). On refresh, the init IIFE reads `preFocusState` to restore the original panel state, then clears it. Without this, panels would be lost on refresh from a focus mode.

**Why `preNarrowState` doesn't persist:** Resize context is session-bound. When you reopen the app, `isNarrow` is freshly computed from the current window width — there's no "returning from narrow" to restore.

#### Domain Boundaries

When crossing from one domain to another, restoration tickets may be absorbed:

- **Resize wide→narrow absorbs focus tickets:** `preFocusState` is cleared because the narrow transition saves its own `preNarrowState` (which includes the pre-focus panel state if `preFocusState` exists). Focus mode context is subsumed into the resize transition.

#### `zenFromMinizen` — No Longer Persisted (v1.10.37+)

`zenFromMinizen` is now `useState(false)` — it resets on refresh along with zen/minizen. Since focus modes don't survive refresh, the metadata tracking how zen was entered doesn't need to either.

## ESC Key Behavior (IMPORTANT)

ESC key has context-dependent behavior. Two handlers coordinate this:

### Handler Architecture

| Handler | Location | Phase | Purpose |
|---------|----------|-------|---------|
| Password flow | `PasswordSettings.tsx` | Capture (runs first) | Reset password flow, call `preventDefault()` |
| App handler | `App.tsx` | Bubble (runs second) | Exit zen or lock app |

### ESC Priority (checked in order)

1. **Password flow active** → Reset flow (handled by PasswordSettings, capture phase)
2. **Scramble active (v2.4.18+)** → Unscramble only (no other ESC behavior fires). Works from editor, title input, or anywhere. In the title input, `stopPropagation()` is skipped when scrambled so the event bubbles to the App handler.
3. **Zen mode** → Exit zen, restore previous state (works even when typing in editor!)
4. **User in password input** → Do nothing (only `<input>`, NOT `<textarea>`)
5. **Minizen mode (wide)** → Exit minizen, restore previous state (including panels)
6. **Function menus open** → Close all panels (both at once)
7. **Narrow + sidebar hidden** → Show sidebar
8. **Base state** → Lock app (sidebar visible, no menus open)

**IMPORTANT:** Scramble check comes BEFORE everything else (after password flow). This means ESC while scrambled ONLY unscrambles — it won't exit zen, close panels, or lock. Zen mode check comes BEFORE the input check, ensuring ESC exits zen even when focused in the editor textarea.

### The ESC Philosophy

**ESC = see all 3 layouts before you can lock (both modes, v2.4.40+)**

ESC walks through all 3 layouts before locking. In wide mode: base → mz → zen → mz → base. In narrow mode: sidebar → default → zen → default → sidebar. You must visit all 3 layouts in a single ESC sequence. Any non-ESC interaction (typing, clicking) resets the sequence. Panels close first (any state → base/sidebar). At base/sidebar after the full cycle with password, ESC locks. Without password, it restarts.

**Example flows (with password):**
```
Wide from base:     base → mz → zen → mz → base → 🔒 LOCK      (5 presses)
Wide from mz:       mz → zen → mz → base → 🔒 LOCK              (4 presses)
Wide from zen:      zen → mz → base → 🔒 LOCK                     (3 presses)
Narrow from sidebar: sidebar → default → zen → default → sidebar → 🔒 LOCK (5 presses)
Narrow from default: default → zen → default → sidebar → 🔒 LOCK  (4 presses)
Narrow from zen:     zen → default → sidebar → 🔒 LOCK             (3 presses)
```

**No password:** loops forever in both modes.

**Cycle resets:** Any non-ESC keydown, mousedown, or window resize resets `escVisitedZenRef` to `false` (global listeners). This ensures the cycle always starts fresh after any interaction — you can't lock with a stale flag from a previous cycle.

### Ref Pattern for Layout State in ESC Handler

The ESC handler uses refs to track `zenMode` and `minizen` to avoid stale closure issues:

```tsx
// Refs in useLayoutState.ts (always current)
const zenModeRef = useRef(zenMode);
useEffect(() => { zenModeRef.current = zenMode; }, [zenMode]);
const minizenRef = useRef(minizen);
useEffect(() => { minizenRef.current = minizen; }, [minizen]);

// Visited-zen flag in App.tsx (tracks cycle progress)
const escVisitedZenRef = useRef(false);
```

This pattern ensures the handler always sees the current values without re-registering on every state change. The `escVisitedZenRef` is reset by global keydown/mousedown listeners (any non-ESC interaction).

### When ESC Should NOT Lock

1. **Password flow is active** - `showInput && !isSaving` in PasswordSettings
2. **ESC was already handled** - Check `e.defaultPrevented`
3. **Scramble is active** - Unscramble instead (v2.4.18+)
4. **User in `<input>`** - Only blocks `<input>` elements, NOT the editor `<textarea>`
5. **Narrow + any non-base state** - Zen, panels, sidebar hidden all handled before lock
6. **Wide + any non-base state** - Bounce cycle handles zen, mz, panels
7. **Wide + base + no password** - Restarts cycle instead of locking
8. **Wide + base + !visitedZen** - Haven't seen all 3 layouts yet, enters mz

### When ESC SHOULD Lock

1. **Wide + base + visitedZen + hasPassword** - Completed full cycle, save + lock
2. **Narrow + sidebar visible** - No panels open, no zen
3. **After password saved** - Label says "esc to lock", `isSaving=true`

**Pre-lock save (v2.4.21+):** Before locking, the ESC handler saves the editor content via `saveEntry()` — but **only if `auth.hasPassword` is true**. Without this guard, ESC on a fresh journal (no password) would persist the empty today placeholder to IndexedDB, creating a ghost sidebar entry. The save is only needed to flush pending content before the lock screen appears.

## Font Sizes

| Name | Size | Class | Elements |
|------|------|-------|----------|
| **title** | 24px | `text-2xl font-extrabold` | "good days" title, lock screen corners |
| **heading** | 18px | `text-lg font-extrabold` | Date header ("jan 30, 2025") |
| **body** | 16px | `text-base font-bold` | Editor text, placeholder, about panel |
| **label** | 14px | inline `fontSize: '14px'` | Sidebar buttons, entry dates, footer, "started at" |
| **caption** | 12px | `text-xs font-bold` | Stats, settings controls, password inputs, presets |

### "started at" Time Display (v2.1.29+)

The entry header shows "started at HH:MM" by default. Seconds are only shown when the poweruser menu is open (`stacked` prop = `showDebugMenu && showAboutPanel`), displaying "started at HH:MM:SS". Works in both 12-hour and 24-hour formats.

**Time format sync (v2.4.29+):** `EntryHeader` listens for a `timeFormatChange` custom event (dispatched by `TimeDisplay` when the user toggles 12h/24h) plus the standard `storage` event (for cross-tab sync). Previously used a 100ms `setInterval` poll for same-tab changes — replaced with the custom event for instant, zero-overhead reactivity.

Code location: `src/features/journal/components/EntryHeader.tsx`

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

**The problem:** When button text changes on hover to something that occupies fewer lines, the button height shrinks. If the cursor was near the bottom edge, it's now outside the button. This triggers mouse leave, which restores the original text, the button grows, the cursor is inside again, mouse enter fires — infinite flicker loop.

**Key insight:** This is a LINE COUNT problem, not a character count problem. The same text might fit on one line when the app is wide, but wrap to two lines when narrow.

**Pattern name:** We call this **"stable hover"** — the hover hitbox stays stable while the button can visually change.

#### Solution: Coordinate-Based Stable Hover (Button Visually Shrinks)

Use the `useStableHover` hook from `@shared/hooks`.

Use when you want the button to visually shrink but need the hover state to stay stable. Pure coordinate math — no overlay div, no scroll blocking.

```
How it works:
1. Mouse enters → capture bounding rect → set hovered
2. Button shrinks → mouseLeave fires
3. Check: is cursor still in captured rect?
   ├─ Yes: stay hovered (global mousemove monitors for real exit)
   └─ No: unhover
```

```tsx
import { useStableHover } from '@shared/hooks';

const { hovered, containerProps } = useStableHover();

// In JSX:
<div {...containerProps}>
  <FunctionButton>
    {hovered ? 'short text' : 'longer text that might wrap'}
  </FunctionButton>
</div>
```

**How it works:**
- On enter: captures bounding rect before any state change
- On leave: checks if cursor is still inside captured rect — if so, stays hovered
- Global mousemove listener (only while hovered) detects true exit from original rect
- No overlay div blocking scroll events
- Button freely shrinks/grows based on content
- **Border buffer**: `isInsideRect` adds a 3px buffer to the rect check, matching the FunctionButton `3px solid` border. Without this, cursor positions at the exact border edge oscillate in/out, causing flicker in a narrow strip around the button.

**Edge case:** Scrolling while hovering makes the captured rect stale relative to viewport. Cursor will "exit" even if visually over button. Acceptable — scrolling while hovering is unusual.

Code locations:
- Hook: `src/shared/hooks/useStableHover.ts`
- Scramble hotkey button: `src/features/settings/components/SettingsPanel.tsx`
- Import button: `src/features/export/components/ExportButtons.tsx`

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
| Button text changes, want visual shrink | Absolute Hover Layer |
| Swapping between different UIs, want consistent size | Grid Overlay |
| Same button, different text lengths | Absolute Hover Layer |
| Copy/paste buttons replacing stats display | Grid Overlay |

### Why FunctionButton?

FunctionButton handles all the required behaviors:
- **State management**: Uses `useState` for `isHovered` and `isClicked`
- **Border colors**: Default (60% opacity) → Hover (full color) → Click (65% lightness)
- **Background**: Transparent → Hover (20% opacity fill)
- **Mouse events**: Proper `onMouseEnter`, `onMouseLeave`, `onMouseDown`, `onMouseUp`
- **Click handling**: `e.stopPropagation()` and `e.currentTarget.blur()`
- **Accessibility**: `tabIndex={-1}`, `outline-none`, `select-none`

### DO NOT

```tsx
// BAD - Never do this:
<button
  onClick={handleClick}
  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'white'}
  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'gray'}
>
  bad button
</button>
```

This breaks the style guide because:
1. No proper state management (border flickers)
2. Inline style manipulation is fragile
3. Missing click behaviors (stopPropagation, blur)
4. Missing accessibility attributes

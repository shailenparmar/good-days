# Claude Code Instructions — Mobile

## Mobile Screen

On mobile devices, the app shows a color picker using touch + accelerometer controls.

### Screens

**Permission Screen** (iOS only, first visit):
```
┌────────────────────────────────┐
│                                │
│          good days             │
│                                │
│   ┌────────────────────────┐   │
│   │    calibrate tilt      │   │  ← Full-width button
│   └────────────────────────┘   │
└────────────────────────────────┘
```

**Home Screen**:
```
┌────────────────────────────────┐
│          good days             │  ← title, one line
│                                │
│        ┌────────┐              │
│        │   ●    │              │  ← Single filled dot
│        └────────┘              │     (tilt feedback)
│                                │
├────────────────────────────────┤
│      recalibrate tilt          │  ← Full-width button (edge-to-edge)
├───────────────┬────────────────┤
│     text      │   background   │  ← Split button (enters adjusting)
├───────────────┼────────────────┤
│     copy      │     paste      │  ← Split button
└───────────────┴────────────────┘
```

**Picker Screen** (while holding background or text):
```
┌────────────────────────────────┐
│          good days             │  ← title, same position as home
│                                │
│            white               │
│   gray ┌────────┐ vivid       │  ← square centered, labels fully
│        │  ● ○   │             │     outside bounds. ● = active,
│        └────────┘              │     ○ = inactive color
│            black               │
│                                │
│ txt: #78cc33   │  bg: #c8ff00  │  ← 2-column color stats (16px monospace bold)
│ h96 s100 l50   │  h84 s100 l88│  ← each column centered above its spectrum
│ ───────────────┃──────────────│  ← Horizontal hue indicators (8px when active, 4px idle)
│  hue gradient  ┃ hue gradient │  ← Split hue bars (ROYGBIV bottom→top, 8px divider)
│                ┃              │
└────────────────┻──────────────┘
```

**Code Entry Screen** (v2.4.27+, shown when 0 or 2+ desktops on same IP):
```
┌────────────────────────────────┐
│          g38d d7ys             │  ← flickering digits title (v2.4.31+)
│                                │
│   enter your desktop code      │  ← 20px monospace bold
│                                │
│         ┌─────┐                │
│         │ _ _ _│               │  ← 3-digit input, 48px mono
│         └─────┘                │     autoFocus, 4px border
│                                │
│         ─────────              │  ← 2px divider
│          skip                  │  ← aux button
│                                │
└────────────────────────────────┘
```

The candidates picker ("which one is yours?") was removed in v2.4.27. All ambiguous cases (2+ laptops or 0 on same IP) now show the code entry screen. Auto-pair (1 laptop) still happens without any screen.

**Flickering title (v2.4.31+):** The code entry screen title shows "g##d d#ys" where the three digit positions rapidly cycle through random 0-9 digits every 50ms. The effect runs via `setInterval` only when the code entry screen is visible (cleanup on hide). Hold-to-show-version still works. The other screens (home, picker, permission) still show "good days".

### Layout Centering & Square Sizing (v1.10.17+)

The tilt square complex (square + L corners + sat/light labels) is dynamically sized and centered between the title and bottom section.

**Key principle:** The L corners must be at the **exact same position** on both the home screen and picker screen. No visual jump on transition.

**How it works:**
1. Both screens have identical bottom section heights (picker uses invisible buttons matching home buttons; hex codes are inside the overlay, not adding extra height)
2. Both `flex: 1` containers use the same padding, so the available space is identical
3. A `ResizeObserver` measures the home container and computes the largest square that fits: `squareSize = min(availableHeight, availableWidth)`
4. Both screens render `tiltSquare(squareSize)` — same size, same position

**Spacing from label bounds:**

| Gap | From | To | Size |
|-----|------|----|------|
| Top | Bottom of "good days" title | Top of "white" label | 24px |
| Bottom | Bottom of "black" label | Top of hex codes (picker) / buttons (home) | 24px |

Labels have `lineHeight: 20px` and overhang the square edges by 10px (half the line height). Container padding = 24px (gap) + 10px (label overhang) = **34px** from the square's edge to the boundary.

```
CONTAINER_PADDING = SQUARE_PADDING (24) + LABEL_OVERHANG (10) = 34px
```

**Hex codes and spectra layout (v1.10.28+, updated v2.3.27):**

The picker displays color stats in a 2-column layout (v2.3.27+): each column is centered above its respective spectrum bar. Line 1: `txt:`/`bg:` prefix + hex. Line 2: HSL values. The spectra are squished vertically to make room (gradient compressed, all hues still represented, flipped so 0° is at bottom and 359° at top — ROYGBIV from bottom to top). No "text"/"background" labels on spectra (v1.10.28+).

```
Picker bottom section:
┌────────────────────────────────┐
│ txt: #78cc33   │  bg: #c8ff00  │ ← 2 columns, each centered above its bar
│ h96 s100 l50   │  h84 s100 l88 │ ← HSL values (16px monospace bold)
│ ──────────────╋───────────────│ ← Hue indicators (center-based, clip at edges)
│  hue gradient ┃ hue gradient  │ ← Spectra (ROYGBIV bottom→top, 8px divider)
│               ┃               │ ← No labels here (removed in v1.10.28)
└───────────────┻───────────────┘
```

**Vertical divider:** 8px wide, absolutely positioned at center of bars overlay (`left: 50%, transform: translateX(-50%)`), flush top and bottom with spectra.

**Square is always a square:** `width = height = squareSize`. On most phones (portrait), width constrains the size, so vertical gaps may exceed 24px. The 24px is the minimum gap when height-constrained.

### Seamless Touch Tracking

The picker uses a **seamless press-hold-drag-release** interaction:

1. Touch handlers attached on component mount (always listening)
2. On button touchstart: `isTrackingRef = true`, `activeSide` set to 'left' or 'right'
3. `liveTouch` ref continuously updated by touchmove events
4. When picker renders and bars mount, indicator immediately snaps to current finger Y
5. Dragging updates indicator position in real-time
6. Release locks color with haptic feedback

**Key refs:**
- `isTrackingRef` - Whether touch tracking is active
- `activeSide` - Which bar is being controlled ('left' = text, 'right' = background)
- `liveTouch` - Current finger position `{ x, y }`
- `barsMounted` - Counter for when both hue bars have mounted

**`sendColorThrottled` helper (v2.4.29+):** A `useCallback` that wraps the WS send with 16ms throttle (~60fps). Used by both `processTouchAt` (hue changes) and the orientation handler (sat/light changes). Replaces 4 identical inline throttle blocks.

### Tilt Controls (Absolute Mapping)

Tilt values use **absolute mapping** from the phone's orientation when picking started:

| Tilt | Controls | Mapping |
|------|----------|---------|
| Left/Right (gamma) | Saturation | Left = 0%, Flat = 50%, Right = 100% |
| Forward/Back (beta) | Lightness | Forward = 5%, Flat = 50%, Back = 95% |

**Max tilt angle**: ±10° to reach extremes (20° total range)

The sat/light square shows two marker types (v2.0.2+, doubled from v1.10.61):

| Shape | Meaning | When |
|-------|---------|------|
| **Filled circle** (40px) | Active — being controlled by tilt, or tilt feedback on home | Home (tilt feedback), picker (active color) |
| **Hollow circle** (40px, 4px border) | Inactive color position | Picker only (the color not being adjusted) |

**Home screen:** Single filled dot showing tilt position (accelerometer feedback).

**Picker screen:** Filled dot = active color being controlled, hollow circle = other color's position.

- L corner brackets: 32×4px, positioned OUTSIDE the marker travel area (v1.10.48+) — they frame the pure square space where markers can move
- No + crosshair (removed in v1.10.26)
- Edge midpoint labels (picker only): light (top), dark (bottom), muted (left), vivid (right)
- Labels are fully outside the square bounds (v1.10.26+, were straddling edges), 16px monospace bold
- No sat/light number stats (removed in v1.10.7)
- Square is dynamically sized via `ResizeObserver` — largest square that fits (v1.10.17+)

### Direct Adjusting (v1.10.61+)

The picker goes directly to adjusting — no seeking/docking phase. Pressing "text" or "background" immediately enters adjusting mode. The active color jumps to the current tilt position (color jump is the accepted tradeoff for keeping tilt calibration true — center = center).

**Editing state machine:** `null` (home) → `'adjusting'` → `null` (on release)

**Flow:**
1. Press "text" button → enters **adjusting** for text color immediately
2. Tilt controls text sat/light. Filled dot shows active position. Bg shown as hollow circle.
3. Slide thumb to bg hue bar → switches to adjusting bg. Color jumps to current tilt position.
4. Lift finger → back to home.

**Side switching** is detected in the global `touchmove` handler. When the finger crosses the midline between hue bars and `activeSide` changes, the active color switches. The new color jumps to the current tilt position.

**Key state/refs:**
- `editing`: `'adjusting' | null` — current phase
- `activeDot`: `'text' | 'bg'` — which color we're adjusting
- `colorsRef`: ref mirroring `colors` state for use in orientation handler
- `activeSide`: ref `'left' | 'right'` — which hue bar is active (left=text, right=bg)
- `trackedTouches`: ref `Map<number, 'left' | 'right'>` — all active touch IDs mapped to their bar side
- `alphaTouchId`: ref `number | null` — which touch ID is alpha (controls tilt)

### Multitouch Alpha/Beta Hue Control (v1.10.64+)

Two-finger simultaneous control of both hue bars. The first finger down is **alpha** (controls tilt for sat/light). A second finger on the **other** bar becomes **beta** (controls that bar's hue independently, no tilt).

**Concepts:**
- **Alpha**: The touch that owns tilt. `activeSide` always reflects alpha's side. The orientation handler reads `activeSide` unchanged.
- **Beta**: A second touch on the opposite bar. Only controls hue on its bar. One finger per bar enforced.

**Flow:**
1. Press "text" or "background" → initial touch recorded as alpha in `trackedTouches` and `alphaTouchId`
2. Place second finger on the other hue bar → detected on `touchstart` (instant, no movement needed) → registered as beta, haptic tick
3. Both fingers independently control their respective hue bars. Tilt controls alpha's sat/light.
4. Release alpha → beta promoted: `alphaTouchId` updated, `activeSide` switches, `activeDot` swaps, haptic tick. Tilt now controls the promoted finger's color.
5. Can add a new second finger on the now-free bar → back to two-finger mode
6. Release all fingers → exits picker (same end behavior as before)

**Single-finger crossover preserved:** When only one finger is down (`trackedTouches.size === 1`), crossing the midline still switches sides (same as pre-multitouch behavior). Disabled when two fingers are down (both bars occupied).

**Beta detection:** New touches are detected in both `touchstart` (instant registration) and `touchmove` (fallback). The `touchstart` handler ensures beta registers the moment the finger touches down, not after movement.

**Hue needle sizes (v1.10.64+):**

| State | Alpha needle | Beta needle | Idle |
|-------|-------------|-------------|------|
| One finger | 16px (4x) | — | 4px |
| Two fingers | 16px (4x) | 8px (2x) | 4px |

Alpha is always the thick needle. When beta is promoted to alpha, its needle grows from 8px to 16px.

**Indicator active detection:** Each bar checks `trackedTouches.current.values().includes(side)` instead of `activeSide.current === side`. This allows both bars to show active indicators simultaneously.

**Haptics (v1.10.64+):** All touch event haptics are 10ms (was 5ms for side crossover, beta join, and alpha promotion — too short to feel). End pattern unchanged: `[5, 30, 5]`.

**What stays the same:**
- Orientation handler reads `activeSide.current` which always = alpha's side
- Single-finger behavior identical to pre-multitouch
- WebSocket streaming follows alpha's color
- Button engagement tracking unrelated

### Button Styling

All mobile buttons (including the permission screen "calibrate tilt" button) use the shared `getButtonStyle()` helper:
- **Default**: 60% opacity border, transparent fill
- **Pressed**: 100% opacity border, 65% lightness, 20% opacity fill
- **Font**: monospace, weight 800, 20px
- **Border**: 4px solid (2px on split interior edges), 12px radius
- **Width**: Constrained to match "good days" title width (`9ch` at title font size, v1.10.61+), centered with `alignSelf: 'center'`
- **Bottom padding**: 44px on all screens (v1.10.61+, was 60px)

**Button order** (top to bottom): recalibrate tilt → text|background → copy|paste (+ save when live)

**Button sizing by role (v1.10.66+):**

`getButtonStyle` accepts an optional `role` parameter controlling vertical padding:

| Role | Padding | Usage |
|------|---------|-------|
| `'picker'` | 28px (2x) | text\|background buttons — large touch target for the primary interaction |
| `'aux'` | 7px (0.5x) | calibrate tilt, recalibrate tilt, copy, save, paste — smaller, less prominent |

This applies always (not gated on live mode). The picker buttons are the primary action, so they're visually dominant. The invisible spacer buttons on the picker screen and permission screen placeholders use matching roles to keep heights consistent across all three screens.

### Button Drag-Off Cancellation (v1.10.22+)

The recalibrate, copy, and paste buttons support **drag-off cancellation**: press a button, drag your finger off, and the action does NOT fire. This makes buttons "less committal" — the user can change their mind mid-press.

**Implementation:** A `buttonEngaged` ref tracks per-button engagement state. `onTouchMove` checks if the finger is still inside the button's bounding rect via `isTouchInside()`. If outside, the engaged flag and pressed visual state are cleared.

| Event | Behavior |
|-------|----------|
| touchStart | Set engaged=true, show pressed state |
| touchMove (inside) | No change |
| touchMove (outside) | Set engaged=false, clear pressed state |
| touchEnd | Fire action only if still engaged, clear state |
| touchCancel (long press) | Clear state, do NOT fire action (intentional) |

**Not applied to text|background buttons** — those use a press-and-drag-into-picker interaction pattern where drag-off doesn't apply.

**Applied to pairing screen skip button:** Uses `skipEngaged` ref and `isTouchInside` for the same engage/disengage pattern. (Candidate buttons were removed in v2.4.27 along with the candidates picker.)

**Copy textarea Writing Tools prevention (v1.10.22+):** The temporary textarea used for `execCommand('copy')` now has `writingSuggestions="false"`, `autocomplete/autocorrect/autocapitalize` off, `spellcheck=false`, and explicitly blurs before removal to clear iOS text interaction state.

### iOS Permission

iOS 13+ requires explicit permission for DeviceOrientationEvent:
1. Permission screen shown on first visit
2. User taps "calibrate tilt" button
3. `DeviceOrientationEvent.requestPermission()` called
4. If granted, home screen shown
5. If denied, tilt controls won't work (hue-only mode)

**Synchronous init (v2.4.28+):** `needsPermission` and `permissionGranted` are initialized via `useState` initializers (not `useEffect`). The check (`typeof DOE.requestPermission === 'function'`) is synchronous, so the correct screen shows on the very first render — no flash of the home screen before calibrate appears on iOS.

### Tap-to-Randomize (v2.2.8+, narrowed v2.3.26)

Tapping the feedback segment (middle area between "good days" title and buttons) on the mobile home screen randomizes all 6 color values (text hue/sat/light + bg hue/sat/light) with haptic feedback (10ms vibrate). If paired with a laptop, sends a one-shot `color-update` via the `startStream → sendColorUpdate → stopStream` pattern (same as paste sync).

**Touch target (v2.3.26):** Only the middle flex segment (the `flex: 1` area containing the square, between title and button row). The title, buttons, button gaps, and 44px bottom padding do NOT trigger randomize. The `onTouchEnd` handler is directly on the middle segment div.

**Previous behavior (v2.2.9–v2.3.25):** The entire inner flex container was the touch target, with `data-btn` exclusions on individual buttons/title. Gaps between buttons and bottom padding still triggered randomize.

**Title interaction:** Tapping the title shows the version (touchStart/touchEnd) — separate from randomize.

Code: `handleRandomize` function + `onTouchEnd` on middle segment div in `src/features/mobile/MobileApp.tsx`.

### Copy/Paste

| Button | Action |
|--------|--------|
| `copy` | Copies `txt: #hex hN sN lN\nbg: #hex hN sN lN` to clipboard |
| `paste` | Parses clipboard, applies colors. Only accepts `txt: #hex hN sN lN` / `bg: #hex hN sN lN` format. Shows "invalid format" for 1.5s if clipboard doesn't match (v2.1.32+) |

**Copy format (v2.3.9+):** Hex + HSL on each line. Example:
```
txt: #1fff0f h116 s100 l53
bg: #000000 h96 s100 l0
```

**iOS copy method:** Uses textarea + `document.execCommand('copy')` instead of `navigator.clipboard.writeText()`. The Clipboard API on iOS Safari URL-encodes text when pasting into iMessage and other apps (`%20` for spaces, `%25` for `%`, etc.). The textarea approach writes pure plain text. Falls back to Clipboard API if execCommand fails.

**Paste decoding:** Both mobile and desktop paste handlers run `decodeURIComponent()` on clipboard text before parsing, as a safety net for URL-encoded input.

**Accepted paste format (v2.3.9+):**
- `txt: #hex hN sN lN` - text color (hex + HSL)
- `bg: #hex hN sN lN` - background color (hex + HSL)
- All other formats (bare HSL, comma-separated, hex-only) are rejected as "invalid format"

**Paste validation (v2.1.32+, updated v2.4.30):** When pasted clipboard content doesn't match any supported format, the copy|paste split is replaced by a single full-width "invalid format" indicator, then reverts to copy|paste. Both desktop and mobile use `errorColor` from `getStatusColors()` (WCAG-contrast-safe dynamic red). Desktop: rendered as a full-width `<div>` with `color` and `border` in `errorColor`, dismisses on mouse leave. Mobile (v2.4.30+): rendered as a full-width button (`getButtonStyle` with position `'full'`) with `color` and `borderColor` overridden to `errorColor`, dismisses on any click or keystroke. State: `pasteInvalid` boolean. Works on both mobile (`MobileApp.tsx`) and desktop (`StatsDisplay.tsx`).

**Paste-to-laptop sync (v2.1.20+, fixed v2.1.21):** When paired with a laptop, pasting a color on the mobile home screen sends a one-shot `color-update` to the laptop so it immediately reflects the pasted colors. Normally color updates only stream during the picker screen (60fps while dragging). The relay guards `color-update` behind `client.streaming` (relay.ts line 285), so the paste wraps the update in `startStream()` / `sendColorUpdate()` / `stopStream()` calls — a brief stream burst to push the color through.

### Persistence

Colors persist to `localStorage` key `mobileColors`:
```json
{ "hue": 175, "sat": 100, "light": 21, "bgHue": 84, "bgSat": 100, "bgLight": 88 }
```

### Context Menu Prevention

A global `contextmenu` event listener prevents the iOS Safari long-press context menu from appearing on any element.

The paste button uses additional measures to prevent iOS Writing Tools:
- Text rendered as split character expressions (`{'p'}{'a'}{'s'}{'t'}{'e'}`) so iOS can't pattern-match the word
- `pointerEvents: 'none'` on the text span
- `role="button"`, `tabIndex={-1}` on the button div
- `-webkit-touch-callout: none`, `-webkit-user-select: none` on the button div
- `writingSuggestions="false"` - HTML attribute to disable iOS 18+ Writing Tools
- `contentEditable={false}`, `spellCheck={false}` - marks element as non-editable

Note: The iOS "Paste" callout when reading clipboard via `navigator.clipboard.readText()` is a system requirement and cannot be suppressed or dismissed by tapping outside.

### Hue Indicator Positioning (v1.10.28+)

The hue spectrum is flipped: **0° at bottom, 359° at top** (ROYGBIV from bottom to top, no duplicate red). The horizontal hue indicator uses center-based positioning with `overflow: hidden` on the bars:
```css
top: calc(${((359 - hue) / 359) * 100}% - ${h/2}px)    /* h = 4px idle, 8px active */
```
The indicator's **centerline** is the true hue position. At the extremes (hue 0 at bottom or 359 at top), half the indicator clips off the bar edge via `overflow: hidden`. This matches the mental model that the thin midpoint line marks the actual hue.

**`renderHueIndicator` helper (v2.4.29+):** Extracted from inline IIFEs into a parameterized render function: `renderHueIndicator(side, hue)`. Returns the indicator `<div>` with correct size based on alpha/beta/idle state.

**Active thickness:** The indicator doubles from 4px to 8px when actively picking on that side (`isPicking && activeSide.current === side`). The thickness change is symmetric around the center — 2px added to each side.

**Above-bar snapping:** When the finger slides above the bar top (fast drag), the hue snaps to 359 (top) instead of getting stuck at the last tracked position. Below the bar, `processTouchAt` clamps to hue 0 (bottom).

### Title Version Display

Tap and hold the "good days" title on any screen to show the version number (e.g., "v1.10.7"). Title text replaces entirely with the version — no "good days" prefix. Releases back to "good days" on touch end. Works on all screens (permission, home, picker, code entry).

**Single shared title component (v2.4.29+):** The title is defined once as a `const title` JSX element and used via `{title}` on all screens. All screens share the same touch handlers (`setTitlePressedPersist`) and sessionStorage persistence.

**Refresh persistence (v2.3.28+):** The pressed state is saved to `sessionStorage`. If you're holding the title to show the version and refresh the page, the version shows immediately on reload without needing to re-press. Cleared on touch end/cancel.

**Version:** MobileApp imports `VERSION` from `@shared/version` (v2.4.7+). No separate mobile version to maintain.

### Haptic Feedback

| Event | Pattern |
|-------|---------|
| Touch start (begin picking) | 10ms vibration |
| Touch end (lock color) | 5ms, 30ms pause, 5ms |
| Button tap | 10ms vibration |

### Safe Area Insets (v1.10.28+)

All three mobile screens (permission, picker, home) apply CSS `env(safe-area-inset-*)` padding to handle notch/Dynamic Island and home indicator areas:

```typescript
const safeAreaStyle: React.CSSProperties = {
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
};
```

This ensures content doesn't overlap with device UI elements when added to home screen (PWA mode).

Code location: `src/features/mobile/MobileApp.tsx`

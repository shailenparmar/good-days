# Claude Code Instructions — Mobile

## Mobile Style Guide

### Button Sizes

All buttons use `getButtonStyle(pressed, position, role)`. Three named sizes:

| Name | Role value | Vertical padding | Feel | Usage |
|------|-----------|-----------------|------|-------|
| **action** | `'picker'` | 28px (55px on home) | Tall, dominant | text \| background (press-and-hold primary interaction). Home screen uses inline `padding: '55px 0'` override for expanded height. |
| **standard** | (default) | 14px | Medium | Code entry input, skip button |
| **compact** | `'aux'` | 7px | Short, utility | copy, paste, zero, save |

### Button Positions

| Position | Behavior |
|----------|----------|
| `'full'` | `width: 100%` — single full-width button |
| `'left'` | `flex: 1`, rounded left corners, 2px right border — left half of split |
| `'right'` | `flex: 1`, rounded right corners, 2px left border — right half of split |
| `'center'` | `flex: 1`, no rounded corners, 2px both sides — middle of 3-way split |

### Button Appearance

| State | Border | Fill |
|-------|--------|------|
| Default | 60% opacity | transparent |
| Pressed | 100% opacity, 65% lightness | 20% opacity |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Title ("good days") | monospace | 800 | `min(17vw, 70px)` |
| All buttons | monospace | 800 | 20px |
| Sat/light labels (picker) | monospace | 800 | 16px |
| Color stats (picker) | monospace | 800 | 16px |

### Spacing

| Name | Value | What it is |
|------|-------|------------|
| **button gap** | 12px | Vertical space between buttons in the same group |
| **group gap** | 24px | Vertical space across a divider (12px gap + 12px margin on divider) |
| **ground pad** | 44px | Bottom padding on all screens |

### Structural

| Element | Value |
|---------|-------|
| Button border | 4px solid, 12px radius (all-longhand properties, see note) |
| Split edge | 2px per side, 4px total (shared edge between left\|right buttons) |
| Divider | 2px height, 85% opacity |
| Button width container | `fontSize: 'min(17vw, 70px)'`, `width: '9ch'`, `alignSelf: 'center'` |

The button width container makes all buttons the same width as the "good days" title. Every screen's button area uses this same container pattern.

**Border implementation (v2.6.12+):** `getButtonStyle` uses all-longhand border properties (`borderStyle`, `borderColor`, `borderTopWidth`, `borderBottomWidth`, `borderLeftWidth`, `borderRightWidth`) instead of the `border` shorthand + longhand overrides. React's style reconciliation skips unchanged longhand properties on re-render, so a changed `border` shorthand silently resets the inner-edge overrides. All-longhand avoids this — never mix `border` shorthand with `borderRightWidth`/`borderLeftWidth` longhands in React inline styles.

### Spacing Hierarchy

```
[button]          ← within a group
  12px  (button gap)
[button]
  24px  (group gap = 12px gap + 12px divider margin)
── divider ──
  24px  (group gap)
[button]
```

Related items are closer together (12px). The divider + extra space (24px) creates visual grouping between unrelated sections.

---

## Mobile Screen

On mobile devices, the app shows a color picker using touch + accelerometer controls.

### Screens

**Screen layering (v2.5.26+):** A base canvas layer (preset 1 flagship colors: `hsl(63, 100%, 12%)` text on `hsl(52, 100%, 91%)` bg) sits at the bottom with no zIndex — just the "good days" title, always visible. Every other screen asserts itself on top with explicit zIndex:

| Layer | zIndex (active) | zIndex (inactive) | Condition |
|-------|----------------|-------------------|-----------|
| Base canvas | — (natural) | — | Always visible |
| Picker | 10 | -1 | `isPicking` |
| Home | 10 | -1 | `paired/standalone && !isPicking` |
| Code entry | 20 | -3 | `pairingState === 'enter-code'` |
| Permission | 30 | -2 | `showCalibrate` |

Home and picker share zIndex 10 (mutually exclusive). Home only shows when `pairingState` is `'paired'` or `'standalone'` — during `'connecting'` the base canvas is the only visible layer, giving a clean resting state before WS resolves.

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
│        │   ●    │              │  ← Tap/hold = calibrate tilt
│        └────────┘              │     (single filled dot, tilt feedback)
│                                │
├───────┬────────┬───────┬───────┤
│ copy  │ paste  │ rand  │ save  │  ← Utility row (save only when paired)
├───────┴────────┴───────┴───────┤
│              │                 │
│    text      │   background    │  ← Expanded picker (55px vPad)
│              │                 │
└──────────────┴─────────────────┘
```

**Picker Screen** (while holding background or text):
```
┌────────────────────────────────┐
│          good days             │  ← title (same as all screens, no version on hold)
│                                │
│            white               │
│   gray ┌────────┐ vivid       │  ← square centered, labels fully
│        │  ● ○   │             │     outside bounds. ● = active,
│        └────────┘              │     ○ = inactive color
│            black               │
│                                │
│   #78cc33      │    #c8ff00    │  ← Row 1: hex codes centered (16px monospace bold)
│ h175 s100 l21  │  h84 s100 l88 │  ← Row 2: HSL values centered
│ ───────────────┃──────────────│  ← Horizontal hue indicators (8px when active, 4px idle)
│  hue gradient  ┃ hue gradient │  ← Split hue bars (ROYGBIV bottom→top, 4px divider)
│                ┃              │
└────────────────┻──────────────┘
```

**Code Entry Screen** (v2.4.27+, updated v2.5.36, shown when 0 or 2+ desktops on same IP):
```
┌────────────────────────────────┐
│          good days             │  ← title (same as all screens)
│                                │
│        ┌────────┐              │
│        │        │              │  ← Corner brackets only (no dot)
│        └────────┘              │
│                                │
├────────────────────────────────┤
│      pairing code         │  ← picker-height input, 3-digit
│                                │     bold sweep placeholder
│                                │  ← 24px gap
│          skip              │  ← picker-height button
└────────────────────────────────┘
```

The candidates picker ("which one is yours?") was removed in v2.4.27. All ambiguous cases (2+ laptops or 0 on same IP) now show the code entry screen. Auto-pair (1 laptop) still happens without any screen.

**Bold sweep placeholder (v2.4.39+, updated v2.5.33):** When the code input is empty and not focused, an overlay shows "pairing code" with the signature bold sweep animation (83ms/char, same as editor "start typing" and lock screen "password"). Uses `whiteSpace: 'pre'` to preserve the space between "pairing" and "code" at span boundaries during the sweep. Disappears when focused (user taps input). Reappears when blurred — tapping the corner brackets area blurs the input (iOS doesn't auto-blur on non-interactive taps). Positioned absolutely over the input with `pointerEvents: 'none'`.

**Cursor-to-end on refocus (v2.5.69+):** When tapping back into the code input after blurring (e.g., typed 2 digits, tapped away, tapped back), `onFocus` moves the cursor to the end via `setSelectionRange(len, len)` inside a `requestAnimationFrame` (iOS Safari needs one frame for the selection system to initialize after focus).

**False red flash fix (v2.4.39+):** `pairingStateRef` in `useMobileSync.ts` is reset to `'standalone'` on every new WS connection (`onopen`). Previously, reconnecting while already in `enter-code` state caused the relay's initial `enter-code` message to be misinterpreted as a code rejection, triggering the triple red flash on open.

### Layout Centering & Square Sizing (v1.10.17+)

The tilt square complex (square + L corners + sat/light labels) is dynamically sized and centered between the title and bottom section.

**Key principle (INVARIANT):** The L corners and tilt square must be at the **exact same pixel position** on all screens (home, picker, permission) and must **never shift during interaction** within a screen. This means:
1. **Cross-screen**: Square position identical across home, picker, permission, code entry
2. **Within-screen**: Square position must not change when content above or below it changes

**Any element above or below the square that can change size MUST use a fixed-height container.** The container height must equal the maximum possible content height. Variable-size content is aligned within the container. This prevents the flex layout from redistributing space when content changes. Currently all screens use the same static "good days" title (same font size, same height), so the top anchor is naturally stable. If the title ever becomes dynamic (different text, different size), it MUST be wrapped in a fixed-height container matching the standard title height.

**Bottom alignment rule (v2.5.34+, updated v2.6.74):** The button area height must be identical across all screens so the corner brackets sit at the same position. The home screen's 2-row button structure (aux + expanded picker with 12px gap = 192px) is the reference. All other screens render the exact same invisible button DOM (aux + expanded picker) to set the height, then absolutely position their visible buttons on top. This guarantees pixel-perfect alignment regardless of visible button sizes or gaps.

**How it works:**
1. All screens render the home screen's button structure invisibly (sets exact height)
2. Visible buttons are absolutely positioned within the same container
3. All `flex: 1` containers use the same padding, so the available space is identical
4. A `ResizeObserver` measures the home container and computes the largest square that fits: `squareSize = min(availableHeight, availableWidth)`
5. All screens render `tiltSquare(squareSize)` — same size, same position

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

The picker displays color info in a 2-column layout (v2.3.27+, restored v2.6.49): each column shows two rows — hex code on top, HSL values (`h{0-359} s{0-100} l{0-100}`) below — centered above its respective spectrum bar. No `txt:`/`bg:` prefixes (removed in v2.6.46). The spectra are squished vertically to make room (gradient compressed, all hues still represented, flipped so 0° is at bottom and 359° at top — ROYGBIV from bottom to top).

**Spectra labels removed (v2.6.60+):** The "text"/"background" overlay labels on the hue bars (added v2.6.42) were removed. The picker title is static "good days" (same as all screens) with no version on hold.

```
Picker bottom section:
┌────────────────────────────────┐
│   #78cc33      │    #c8ff00    │ ← Row 1: hex code centered
│ h175 s100 l21  │  h84 s100 l88 │ ← Row 2: HSL values centered
│ ──────────────╋───────────────│ ← Hue indicators (flush with divider, clip at edges)
│  hue gradient ┃ hue gradient  │ ← Spectra (ROYGBIV bottom→top, 4px divider)
│               ┃               │
└───────────────┻───────────────┘
```

**Vertical divider:** 4px wide (v2.6.13+, was 8px), black at 60% opacity (v2.6.47+), absolutely positioned at center of bars overlay (`left: 50%, transform: translateX(-50%)`), flush top and bottom with spectra.

**Needle-divider flush (v2.6.46+):** Hue needles inset 2px on the inner edge (`right: 2` for left bar, `left: 2` for right bar) so they meet the 4px divider flush instead of overlapping behind it. The divider is centered at 50% with `translateX(-50%)`, so it overhangs 2px into each bar.

**Hue needle color (v2.6.44+, updated v2.6.47):** Black at 75% opacity (`rgba(0, 0, 0, 0.6)`).

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

**`sendColorThrottled` helper (v2.4.29+, updated v2.5.7):** A `useCallback` that wraps the WS send with 42ms throttle (~24fps). Used by both `processTouchAt` (hue changes) and the orientation handler (sat/light changes). Replaces 4 identical inline throttle blocks. Was 33ms (~30fps) in v2.5.6, 42ms (~24fps) before that, 33ms (~30fps) before v2.4.123, 21ms (~48fps) before v2.4.120.

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

### Live Continuous Calibration (v2.5.29+)

The square segment (v2.6.76+, formerly the zero/recalibrate button) uses **hold-to-calibrate**: pressing and holding continuously re-zeros the tilt baseline every orientation frame (~60fps). The user can settle the phone into position while holding. Releasing locks the last zero-point. Dragging off pauses calibration (last zero-point sticks), but dragging back in resumes it — calibration toggles with finger position as long as the touch is held.

**Implementation:** Uses `isCalibratingRef` (a `useRef(false)`) checked in the `deviceorientation` handler. While true, `baseline.current.beta/gamma` are overwritten with the current raw orientation every frame. Raw touch handlers on the square segment div control the flag.

| Event | Behavior |
|-------|----------|
| touchStart | `isCalibratingRef = true`, haptic 10ms |
| touchMove (inside) | `isCalibratingRef = true` — resumes if finger returns |
| touchMove (outside) | `isCalibratingRef = false` — pauses calibration, last zero sticks |
| touchEnd | `isCalibratingRef = false` |
| touchCancel | `isCalibratingRef = false` |

**No pressed visual:** The square segment has no visual pressed state (unlike the old button). Only `isCalibratingRef` is toggled.

**Key refs:**
- `isCalibratingRef`: `useRef(false)` — checked every orientation event

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

See **Mobile Style Guide** at the top of this file for the full button system (sizes, positions, appearance, spacing). Quick reference:

- **action** (`'picker'`, 28px): text \| background, pairing code input, skip
- **standard** (default, 14px): allow motion access
- **compact** (`'aux'`, 7px): copy, paste, rand, save

**Button order** (top to bottom): utility row (copy|paste|rand [|save when paired]) → expanded text|background

**Pixel-perfect alignment (v2.5.34+, updated v2.6.74):** All screens render the home screen's exact invisible button DOM (aux + expanded picker) to set the button area height. Visible buttons are absolutely positioned on top. This guarantees the corner brackets and button area top border are at identical positions across all screens.

### Button Drag-Off Cancellation (v1.10.22+)

The copy, paste, allow motion access, and skip buttons support **drag-off cancellation**: press a button, drag your finger off, and the action does NOT fire. This makes buttons "less committal" — the user can change their mind mid-press.

**No re-engage:** Sliding back onto a button after dragging off does NOT re-engage it. iOS Safari doesn't treat `touchend`-after-`touchmove` as a valid user activation for clipboard/permission APIs (copy, paste, allow motion access all need this).

**Implementation:** A `buttonEngaged` ref tracks per-button engagement state. `onTouchMove` checks if the finger is still inside the button's bounding rect via `isTouchInside()`. If outside, the engaged flag and pressed visual state are cleared.

| Event | Behavior |
|-------|----------|
| touchStart | Set engaged=true, show pressed state |
| touchMove (inside) | No change |
| touchMove (outside) | Set engaged=false, clear pressed state |
| touchEnd | Fire action only if still engaged, clear state |
| touchCancel (long press) | Clear state, do NOT fire action (intentional) |

**Not applied to text|background buttons** — those use a press-and-drag-into-picker interaction pattern where drag-off doesn't apply.

**Square segment uses live calibration (v2.6.76+, moved from zero/recalibrate button)** — see [Live Continuous Calibration](#live-continuous-calibration-v2529). Raw touch handlers on the middle flex segment div.

**Applied to pairing screen skip button:** Uses `skipEngaged` ref and `isTouchInside` for the same engage/disengage pattern. (Candidate buttons were removed in v2.4.27 along with the candidates picker.) **Safari keyboard fix (v2.4.56+):** Skip button blurs the code input on `touchStart` (before `preventDefault`) to dismiss the keyboard cleanly. Also fires `skipPairing()` on `touchCancel` — Safari may cancel touches instead of ending them during keyboard/focus transitions, which previously caused the skip action to silently not fire.

**Copy textarea Writing Tools prevention (v1.10.22+):** The temporary textarea used for `execCommand('copy')` now has `writingSuggestions="false"`, `autocomplete/autocorrect/autocapitalize` off, `spellcheck=false`, and explicitly blurs before removal to clear iOS text interaction state.

### iOS Permission

iOS 13+ requires explicit permission for DeviceOrientationEvent:
1. Permission screen shown on first visit
2. User taps "allow motion access" button
3. `DeviceOrientationEvent.requestPermission()` called
4. If granted, `motionPermissionGranted` flag saved to localStorage, home screen shown
5. If denied, tilt controls won't work (hue-only mode)

**Auto-detect permission (v2.5.12+, replaces v2.5.3 localStorage skip):** The permission screen always shows initially on iOS (`typeof DOE.requestPermission === 'function'`). A `useEffect` adds a `deviceorientation` listener — if events are already flowing (beta/gamma not null), it sets `motionPermissionGranted` in localStorage and auto-skips the permission screen. This is more reliable than the previous localStorage-only check, which could be stale (permission revoked since last visit). Tradeoff: returning iOS users may see a brief flash of the permission screen before auto-skip fires.

### Square Segment Calibration (v2.6.76+, replaces tap-to-randomize)

Tapping or holding the square segment (middle flex area between title and buttons) calibrates tilt. Same `isCalibratingRef` pattern as the old zero/recalibrate button — tap = single re-zero, hold = continuous calibration (orientation handler re-zeros every frame while held). Drag off pauses calibration, drag back in resumes.

**Touch target:** Only the middle flex segment (the `flex: 1` area containing the square, between title and button row). The title, buttons, button gaps, and 44px bottom padding do NOT trigger calibration.

**Title interaction:** Tapping the title shows the version (touchStart/touchEnd) — separate from calibration.

**Randomize moved to "rand" button (v2.6.76+):** The `handleRandomize` function (randomize all 6 color values + one-shot sync to laptop) is now triggered by the "rand" `MobileButton` in the utility row instead of the square segment.

**Calibration hint (v2.6.77+):** Bold sweep animation "tap here to recalibrate" below the bottom L corners on the home screen only (not picker). 16px monospace bold, 85% opacity, `pointerEvents: none`. Dismissed permanently on first calibration tap (`hasCalibrated` in localStorage). Same 83ms/char bold sweep pattern as code entry placeholder.

Code: calibration touch handlers on middle segment div + `handleRandomize` on "rand" button in `src/features/mobile/MobileApp.tsx`.

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

Tap and hold the "good days" title on any screen to show the version number (e.g., "v1.10.7"). Title text replaces entirely with the version — no "good days" prefix. Releases back to "good days" on touch end. Works on all screens except the picker (permission, home, code entry).

**Picker screen exception (v2.6.60+):** The picker screen uses a separate `pickerTitle` that shows static "good days" with no touch handlers — hold does nothing, no version display. The shared `title` component (with version hold) is used on all other screens.

**Single shared title component (v2.4.29+, updated v2.6.60):** The `const title` JSX element is used on all screens except picker. The picker uses a separate `const pickerTitle` — same text and style, but no touch handlers.

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

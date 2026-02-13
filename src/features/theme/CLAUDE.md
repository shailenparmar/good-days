# Claude Code Instructions — Theme

## Desktop Color Picker

The color picker in settings uses a 2x2 grid layout with mouse and touch drag support.

### Layout (v1.10.67+)

```
┌──────────┬──────────┐
│ text SL  │  bg SL   │  ← saturation/lightness squares
├──────────┼──────────┤
│ text hue │  bg hue  │  ← rainbow hue squares
└──────────┴──────────┘
  gap: 8px, grid: 1fr 1fr
```

This 4-square layout is permanent (not conditional on live sync mode).

### Indicator Sizes — Selective Sizing (v2.0.5+)

Desktop color picker indicators dynamically reflect what the phone is doing. The phone sends `stream-state` messages whenever touch state changes (start, side crossover, beta join/leave, alpha promotion). The desktop computes a **role** for each picker:

| Role | When | SL dot | Hue needle |
|------|------|--------|------------|
| `idle` | No phone streaming, or this side not being controlled | 16px | 4px |
| `beta` | Phone's beta finger is on this side | 16px | 8px (2x) |
| `alpha` / `local-drag` | Phone's alpha finger is on this side, or local desktop drag | 32px | 16px (4x) |

Size changes are instant (no CSS transitions).

**Hollow hue needles (v2.1.34+):** All hue needles (desktop and mobile) have a transparent slit through the center, 25% of the needle height. This lets you see the hue gradient color through the needle. Implemented via `borderTop` + `borderBottom` (each 37.5% of total height) with `boxSizing: content-box` and transparent content area (25%). SL dots remain solid filled circles. Mobile dots are also unchanged.

**Z-index layering**: Active element always wins. SL picker gets `zIndex: 10` when active (local drag OR live alpha). Hue picker gets `zIndex: 10` when actively dragged. At same z-index, SL dot wins over hue needle (earlier in DOM = top row). Static SL: `zIndex: 2`, static hue: `zIndex: 1`.

**StreamingControls type** (in `src/features/theme/types.ts`):
```typescript
interface StreamingControls {
  alpha: { side: 'text' | 'background' };
  beta: { side: 'text' | 'background' } | null;
}
```

**Data flow**: Phone touch handler → `sendStreamState()` → relay forwards → desktop `useWebSync` → `WebSyncBridge` → `ThemeContext.streamingControls` → `ColorPicker` reads it.

**stream-state sent at 5 control-state change points in `src/features/mobile/MobileApp.tsx`**:
1. `startPicking()` — initial alpha, no beta
2. Single-finger crossover in `handleMove` — alpha side switched
3. Beta touch detected in `handleStart` — beta joined
4. Alpha lifts, beta promoted in `handleEnd` — new alpha, no beta
5. Beta lifts, alpha continues in `handleEnd` — beta gone

SL uses `overflow: visible` so the dot can extend beyond the square bounds. Hue uses `overflow: hidden` so the needle clips at the edges (v2.1.37+). SL has `zIndex: 2`, hue has `zIndex: 1` (dot wins over needle when overlapping). The hue needle is a solid black bar (v2.1.38 — reverted from hollow slit). Sizing is standardized across mobile and desktop: alpha/local-drag 16px, beta 8px, idle 4px.

### Drag Listener Cleanup

When the user mousedowns/touchstarts on a picker square, `mousemove`/`touchmove` and `mouseup`/`touchend`/`touchcancel` listeners are added to `document`. The up handler removes all listeners. Active listeners are tracked in a ref (`listenersRef`) so they can be cleaned up on component unmount - this prevents a memory leak if the component is removed mid-drag.

Code location: `src/features/theme/components/ColorPicker.tsx`

### Desktop Drag During Live Streaming (v2.1.18+)

When the phone is streaming colors at 60fps and the desktop user drags a color picker, the phone's `color-update` messages would fight the local drag setters, causing visible flicker. A `localDragRef` flag suppresses `applyPreset` in the WebSocket callback during desktop drags.

**How it works:**
1. Desktop `ColorPicker.startDrag()` sets `localDragRef.current = true`
2. `WebSyncBridge.handleColorUpdate()` checks the flag — if true, calls `setLivePreset()` (so the phone's colors are tracked) but skips `applyPreset()` (so the local drag isn't overwritten)
3. Desktop `handleUp()` sets `localDragRef.current = false`
4. Next `color-update` from phone resumes normal `applyPreset()` flow

**Key insight:** `setLivePreset` still runs during the drag, so the phone's latest colors are always tracked. When the user releases, the phone's colors resume immediately from wherever it left off.

Code locations:
- `localDragRef` + `setLocalDragging`: `ThemeContext.tsx`
- Flag set/clear: `ColorPicker.tsx` (`startDrag` and both `handleUp` callbacks)
- Flag check: `WebSyncBridge.tsx` (`handleColorUpdate` callback)

## Color Presets

Default presets are defined in `src/features/theme/context/ThemeContext.tsx`:

| Preset | Text Color | Background Color | Description |
|--------|------------|------------------|-------------|
| **1** | hsl(116, 75%, 11%) dark green #0a3107 | hsl(52, 100%, 91%) light yellow #fff9d1 | Default for new users |
| **2** | hsl(229, 61%, 100%) white | hsl(251, 100%, 59%) purple | — |
| **3** | hsl(360, 100%, 49%) red | hsl(360, 100%, 13%) dark red | — |
| **4** | hsl(36, 58%, 38%) dark gold #996c29 | hsl(181, 52%, 10%) dark teal #0c2627 | — |
| **5** | hsl(116, 100%, 53%) bright green | hsl(96, 100%, 0%) black | — |

### New User Defaults

New users see **Preset 1** (black on peach). Two places set this:

1. **React defaults**: `ThemeContext.tsx` uses `DEFAULT_PRESETS[0]` for initial state
2. **HTML fallbacks**: `index.html` has hardcoded values for pre-React page load (prevents flash)

When changing the default preset, update BOTH locations.

### Error Screen

The error boundary (`src/shared/components/ErrorBoundary.tsx`) uses hardcoded DEFAULT_PRESET_1 colors:
- Text: `hsl(116, 75%, 11%)` - dark green
- Background: `hsl(52, 100%, 91%)` - light yellow

These are intentionally NOT tied to presets so the error screen always displays consistently. The "something went wrong" screen is the only user-approved copy screen.

### Preset Grid Layout

The preset grid (`PresetGrid.tsx`) is a 5-column CSS grid with no height limit — it grows freely to accommodate any number of presets. Users can create unlimited custom presets via the "save" button.

### Preset Keyboard Navigation

When settings is open, presets can be controlled with the keyboard:

| Key | Action |
|-----|--------|
| Arrow keys | Navigate between presets (auto-applies on move) |
| Space / Enter | Save current colors to the active preset |
| Backspace / Delete | Delete the active preset |
| Cmd+Z / Ctrl+Z | Undo last preset deletion or edit |

#### Preset Undo (multi-level, v2.3.29+, expanded v2.4.37)

Multi-level undo for preset deletions AND edits. An `undoStackRef` (array) in `PresetGrid.tsx` stores undo entries with `action: 'delete' | 'edit'`. Each Cmd+Z / Ctrl+Z pops the most recent action: deletions are spliced back at their original index, edits restore the old colors to the preset at that index.

| Scenario | Behavior |
|----------|----------|
| Delete 3, then Cmd+Z 3 times | All three restored in reverse order |
| Edit preset, Cmd+Z | Old colors restored to that preset |
| Mix of deletes and edits, Cmd+Z | Undone in reverse order regardless of type |
| Close settings, reopen, Cmd+Z | No undo (ref cleared on unmount) |
| Cmd+Z with nothing to undo | No-op (but still `preventDefault`s to block native undo) |
| Cmd+Z while typing in editor | Browser native undo (handler skips input/textarea/contentEditable) |

**No conflict with editor Cmd+Z:** The handler runs in capture phase but has an early return for input/textarea/contentEditable elements, so editor undo works normally.

**No conflict with password inputs (v2.4.37+):** Cmd+Z is blocked from interacting with password fields at three levels: (1) `onKeyDown` on the password `<input>` calls `preventDefault`, (2) the "saved" dismiss handler in PasswordSettings ignores Cmd+Z, (3) the preset undo handler always calls `preventDefault` when settings is open (even with empty stack) to block native undo from reaching any input.

#### Editor Auto-Focus & Date Switch (v1.10.23+)

The app has a "type anywhere to focus editor" feature. When you press a key, it auto-focuses the editor so you can start typing.

**If viewing a past entry**, typing switches to today's entry first, then focuses the editor and inserts the character. This uses a deferred focus (double `requestAnimationFrame`) to wait for React to re-render the textarea as editable before focusing and inserting.

| Key type | Behavior on past entry |
|----------|----------------------|
| Printable character | Switch to today, focus, insert character |
| Space | Switch to today, focus, insert space |
| Enter | Switch to today, focus, insert newline |
| Backspace | Switch to today, focus only (no deletion for safety) |

Code location: `App.tsx` `handleGlobalKeyDown`

**Read-only textarea passthrough (v1.10.59+):** When viewing an old entry, the textarea is `readOnly`. If the user clicks/taps into it (common in narrow mode where the editor is full-screen), the global handler must still fire to switch to today. Two guards are aware of this:

1. The textarea guard skips writable textareas but allows read-only ones through: `if (tagName === 'textarea' && !readOnly) return`
2. The editor-contains guard only skips when on today's entry: `if (editorRef.contains(activeEl) && selectedDate === today) return`

Before v1.10.59, both guards bailed unconditionally, so clicking an old entry's editor and typing did nothing.

**Settings protection:** When settings is open (whether just settings, poweruser menu, or powerscramble), Space/Enter/Backspace must NOT trigger this auto-focus. These keys are reserved for preset controls. This is handled in `App.tsx`:

```tsx
// When settings open, protect Enter/Backspace/Space from focusing editor (for preset controls)
if (showDebugMenu && (e.key === 'Enter' || e.key === 'Backspace' || e.key === ' ')) return;
```

**Important distinction:** This protection only prevents these keys from *focusing* the editor. Once you're already focused in the editor, all keys work normally (Backspace deletes characters, Space adds spaces, Enter adds newlines).

#### Pulse Animation Reset

Active presets show a pulsing border animation (`preset-pulse` class). The animation resets to give visual feedback on interaction. This is done by incrementing a `pulseKey` state that's part of each button's React key — when the key changes, React remounts the element and the CSS animation restarts from 0%.

**Style rule: Buttons that toggle between states (default presets, custom presets, live) only call `setPulseKey(k => k + 1)` when re-clicking an already-active button.** Buttons that always perform an action (rand, save) call it every click. This prevents the shared `pulseKey` from causing visual artifacts (border width snap from animated 4-6px to static 3px) on the previously-active button when switching selection.

| Button type | Where pulse reset happens |
|-------------|--------------------------|
| Default presets | `handlePresetClick()` (when `wasActive`) |
| Custom presets | `handleCustomPresetClick()` (when `wasActive`) |
| live | Inline onClick (only when `isLiveActive` already true) |
| rand | Inline onClick (every click) |
| save | Inline onClick (every click) |
| Space/Enter key | Keyboard handler (line ~220) |

**`isLiveActive` clearing (v2.3.13+):** All buttons that switch away from live must call `setIsLiveActive(false)`. This includes `handlePresetClick`, `handleCustomPresetClick`, rand onClick, and save onClick.

#### Auto-Switch to Live on Stream Start (v2.3.13+)

When the phone starts streaming colors (user touches color picker), the desktop auto-switches the preset selection to `[live]` so the live button pulses. This happens in `WebSyncBridge.tsx` via a `prevStreamingRef` tracking the `false → true` transition of `syncState.isStreaming`. Previously, auto-select only happened on initial pairing (null → value transition of `livePreset`), meaning the user could click away from live and not see it re-pulse when streaming resumed.

Code location: `src/features/theme/components/PresetGrid.tsx`

#### Keyboard Hint Text

When the hint appears (after clicking presets a few times), it shows:
```
navigate with arrow keys.
select with spacebar.
delete with backspace.
```

The bold sweep animation runs across all three lines sequentially.

## Color Stats Copy/Paste

In poweruser mode, the color stats area (txt/bg HSL values) shows copy/paste buttons on hover.

### Hover Region Structure

The hover region must only cover the text content, not the spacing above it. This is achieved with nested divs:

```tsx
{/* Outer div: spacing and border (NOT part of hover region) */}
<div className="mt-3 pt-3" style={{ borderTop: '2px solid ...' }}>
  {/* Inner div: hover detection (ONLY this is the hover region) */}
  <div
    style={{ display: 'grid' }}
    onMouseEnter={() => setColorAreaHovered(true)}
    onMouseLeave={() => setColorAreaHovered(false)}
  >
    {/* Copy/paste buttons and color stats grid */}
  </div>
</div>
```

**Why this matters:** If `onMouseEnter`/`onMouseLeave` are on the outer div, the hover region extends into the `pt-3` padding above the text, triggering the buttons prematurely.

### Behavior

| State | Display |
|-------|---------|
| Not hovered | 2x2 grid matching other stats: row 1 `txt: #hex` / `bg: #hex`, row 2 `hN sN lN` / `hN sN lN` — each centered in its column (v2.3.24+) |
| Hovered | Split buttons: `copy` (left) / `paste` (right) |

**Copy**: Copies both colors to clipboard with hex + HSL:
```
txt: #1fff0f h116 s100 l53
bg: #000000 h96 s100 l0
```

**Paste**: Reads clipboard, parses color values, applies them, creates new preset. Only accepts the `txt: #hex hN sN lN` / `bg: #hex hN sN lN` format.

Code location: `src/features/statistics/components/StatsDisplay.tsx`

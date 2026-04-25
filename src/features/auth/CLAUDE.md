# Claude Code Instructions — Auth

### Lock Screen Rate Limiting (v2.4.131+)

After 3 consecutive failed password attempts, the lock screen enforces an exponential backoff cooldown before the next attempt. During cooldown, the input and submit button are disabled, and the placeholder shows a countdown number with the bold sweep animation.

**Backoff schedule:** `min(2^(attempts-3), 32)` seconds — 1s, 2s, 4s, 8s, 16s, max 32s. Resets to 0 on successful unlock.

**Countdown display:** The placeholder text switches from "password" to the remaining seconds (e.g., "4"). The bold sweep animation resets on each number change. Input is cleared when cooldown starts. When cooldown ends, the input auto-focuses via `requestAnimationFrame` (deferred so the input is no longer `disabled` in the DOM). Clicking outside blurs the input and shows the "password" placeholder.

**No auto-focus on lock (v2.6.67+):** The lock screen input does NOT auto-focus. This lets the "password" bold sweep placeholder show immediately. Typing anywhere auto-focuses the input via a `keydown` listener (printable chars only, skips modifiers). Previously used `autoFocus` which hid the placeholder on lock.

**Click-outside blur (v2.6.7+):** Clicking outside the password input on the lock screen blurs it (removes focus styling). Uses `onMouseDown` on the container div to programmatically blur the input.

Code location: `src/features/auth/components/LockScreen.tsx`

### Deferred Key Derivation (v2.7.21+)

Password unlock is split into two phases for instant feedback:

**Phase 1 — Hash check (blocks, ~200ms):** `hashPassword` (one PBKDF2 100k iterations) + `timingSafeEqual` comparison. Returns `true`/`false` immediately. Wrong password flashes red. Right password dismisses lock screen (`setIsLocked(false)`) before any key derivation.

**Phase 2 — Key derivation (background, non-blocking):** On correct password, a fire-and-forget async IIFE runs `derivePasswordKey` (second PBKDF2) + `exportKeyToJWK` + sets `encryptionKeyReady = true`. The `useJournalEntries` effect watches `encryptionKeyReady` and loads/decrypts entries when it flips. Entries "spawn" into the journal as they load.

**Frame yield:** `LockScreen.handleSubmit` yields a `requestAnimationFrame` after `setIsSubmitting(true)` so React can paint the disabled state before the blocking PBKDF2 call.

**Re-lock case:** When ESC-locking and re-unlocking, the encryption key is still in memory (`encryptionKeyReady` never went false). `App.tsx` checks `auth.encryptionKeyReady` — if already true, calls `reloadEntries()` directly. The background derivation still runs but is harmless (overwrites with the same key).

**Progressive entry loading (v2.7.23+):** `initJournalStorage` accepts an optional `onProgress` callback. When provided, entries decrypt one at a time (sequential `for` loop instead of `Promise.all`), calling `onProgress` with the cumulative sorted array. `useJournalEntries` passes a callback that updates `setEntries` progressively — sidebar entries spawn visibly as they decrypt. The final `.then()` sets `isLoading = false` and updates `currentContent`. Without the callback (non-unlock loads like `reloadEntries`), the fast `Promise.all` path is used.

**Batched emits + single sort (v3.0.9+):** Previously the loop sorted the full array and called `onProgress` *every* entry, causing O(N²) sidebar/stats rerenders during unlock (a user with 1k entries would trigger ~500k cumulative button renders). Now `getEntriesFromIndexedDB` only emits every 25 entries or 50ms (whichever first), and sorts once at the end of the loop. The spawn-in feel is preserved while sidebar rerenders drop from N to ~N/25. Constants: `BATCH_SIZE = 25`, `BATCH_MS = 50`. `journal.loaded` action log includes `durationMs` (set in `useJournalEntries.ts` via `performance.now()` deltas) so unlock time can be measured per device via the debug log export.

Code locations: `useAuth.ts` (`handlePasswordSubmit`), `LockScreen.tsx` (`handleSubmit`), `App.tsx` (`handlePasswordSubmit`), `journalStorage.ts` (`initJournalStorage`, `getEntriesFromIndexedDB`), `useJournalEntries.ts` (load effect + `journal.loaded` log)

### Password Dead Man's Switch (v2.1.32+)

If a user has password protection enabled and then clears cookies/site data (which wipes localStorage but not IndexedDB), the journal entries self-destruct on next load. This prevents someone from bypassing the password by clearing browser data.

**How it works:**
1. When a password is set, `await setPasswordProtectedFlag(true)` writes `{ key: 'passwordProtected', value: true }` to the IndexedDB metadata store
2. When a password is removed, `await setPasswordProtectedFlag(false)` clears it
3. On `initJournalStorage()`, if the flag is `true` but `localStorage.getItem('passwordHash')` is `null`, all entries and metadata are cleared from IndexedDB and an empty array is returned

**Important:** `setPasswordProtectedFlag()` is `await`ed in both `setPassword()` and `removePassword()` (v2.1.35+). Previously it was fire-and-forget, meaning the flag write could fail silently or not complete before tab close.

Both `setPassword()` and `removePassword()` also clear `sessionStorage.removeItem(SESSION_UNLOCKED_KEY)` to invalidate any stale session unlock state (v2.1.35+).

Code: `setPasswordProtectedFlag()` in `journalStorage.ts`, called from `useAuth.ts` on set/remove password. Detection logic in `initJournalStorage()`.

### App Reset Fix (v2.1.32+)

The "reset app" flow in SettingsPanel now calls `cancelPendingSaves()` before clearing storage. Previously, a pending debounced save could fire after `localStorage.clear()` / IndexedDB delete and re-write an entry. Also clears IndexedDB stores explicitly before deleting the database, ensuring clean teardown even with other open connections.

### Password Focus Behavior (IMPORTANT)

The password input has specific focus rules to avoid stealing keystrokes from the editor.

**Core principle:** When settings opens, typing should go to the editor (the main writing experience). The password input only captures keystrokes when the user explicitly engages with it.

#### When Settings Opens (No Password Set)

| What happens | Why |
|--------------|-----|
| Password input is **visible** | User can see "set password" placeholder |
| Password input is **NOT focused** | Typing goes to editor, not password input |
| User must **click** the input | Explicitly starts the password flow |

This is intentional. The "type anywhere to focus editor" feature in App.tsx skips if already in an `<input>`, so:
- Input NOT focused → typing goes to editor
- Input IS focused → typing goes to password input

**Cross-platform fix (v1.10.18):** The password input uses `tabIndex={-1}` to prevent the browser from auto-focusing it when the settings panel opens. On **Windows**, clicking a button gives it focus (unlike macOS where the textarea retains focus), and the browser may then auto-focus the first input in newly rendered content. `tabIndex={-1}` removes the input from the browser's focus order while still allowing focus via click or programmatic `.focus()` calls.

#### When Password Flow Is Active

Once the user clicks the input or "change password" button, auto-focus IS used:

| Scenario | Auto-focus? | How |
|----------|-------------|-----|
| Click "change password" button | Yes | `requestAnimationFrame(() => inputRef.current?.focus())` |
| After green flash (step complete) | Yes | `flashGreen(..., true)` with `refocusAfter` |
| After red flash (wrong password) | Yes | `requestAnimationFrame(() => inputRef.current?.focus())` |
| After ESC within flow | Yes | Keeps focus (ready to retype) |
| Click outside input | No | Blurs (user clicked away) |

#### State Variables

```tsx
// Whether to show the input at all
const [showInput, setShowInput] = useState(!hasPassword);

// Key distinction:
// - hasPassword=false: showInput=true on mount, but NOT auto-focused
// - hasPassword=true: showInput=false until "change password" clicked
```

#### Code Location

`src/features/auth/components/PasswordSettings.tsx`

The component has a comment explaining why we DON'T auto-focus on mount:
```tsx
// NOTE: We intentionally do NOT auto-focus when showInput becomes true on mount.
// When settings opens (no password set), typing should go to the editor, not the password input.
```

### Password Flow ESC Behavior

| State | `showInput` | `isSaving` | ESC Result |
|-------|-------------|------------|------------|
| Split buttons | `false` | `false` | Close settings (then base state → lock) |
| "old password" step | `true` | `false` | → Split buttons |
| "new password" step | `true` | `false` | → "old password" |
| "confirm" step | `true` | `false` | → "old password" |
| "set password" (set) | `true` | `false` | If has content → clear input, keep focus. If empty+focused → blur (defocus). If empty+unfocused → pass through to App.tsx |
| "one more time" (set-confirm) | `true` | `false` | → "set password" |
| "password saved" | `true` | `true` | Lock (handler skips, already at base) |

### Click-to-Dismiss Behavior

Password flows can be dismissed by clicking outside the input:

- **After "password saved"** - Press any key to dismiss (clicks don't dismiss — they're intentional actions)
- **During "change password" flow** - Click outside input returns to split buttons
- **During "set password" flow** - Click outside input resets to first step and blurs

### Keystroke to Dismiss Pattern (IMPORTANT)

Status messages (like "saved. lock with esc." or "3 entries imported") dismiss on **keystroke only**, not clicks. Clicks are intentional actions — the user might be clicking to do something else, not to dismiss the status.

```tsx
useEffect(() => {
  if (!showingStatus) return;

  const dismiss = () => {
    // Reset state here
  };

  // Use capture phase so this runs BEFORE any stopPropagation calls in buttons/pickers
  window.addEventListener('keydown', dismiss, true);

  return () => {
    window.removeEventListener('keydown', dismiss, true);
  };
}, [showingStatus]);
```

**Why capture phase?** Many UI components call `e.stopPropagation()` on keydown (buttons, pickers, etc.). Without capture phase, the dismiss handler might not fire. Capture phase runs **before** bubble phase.

**Why keystroke only?**
- Clicks are intentional — user clicked to do something, not to dismiss
- Keystrokes indicate "I'm done looking at this status, moving on"
- If the panel closes, the status naturally disappears with it

**Where this pattern is used:**
- Password "saved. lock with esc." dismiss (`PasswordSettings.tsx`)
- Import feedback dismiss (`ExportButtons.tsx`)

### Click Outside to Dismiss (Different Pattern)

For dismissing *interactive flows* (not status messages), click outside IS appropriate:

- Click outside password input → dismiss password flow (`PasswordSettings.tsx`)

This uses capture phase to run before `stopPropagation()` calls.

### Dynamic Status Colors (Confirm & Error)

Status colors use green (confirm) and red (error) hues with **hue avoidance** to stay visually distinct from the user's text color, and **contrast-guaranteed lightness** for readability on any background.

**Algorithm (v1.9.18+):**
1. **Hue avoidance:** If the ideal hue (green 120° or red 0°) is within 60° of the text color, smoothly blend toward a fallback hue using smoothstep easing. Two fallbacks per color (CW and CCW) ensure the shift always goes AWAY from the text hue, never through it.
2. **Lightness solver:** Binary search for dark (0-50%) and light (50-100%) solutions that meet 3.5:1 contrast. Sigmoid blend picks between them based on background luminance.
3. **Contrast safety net:** If the sigmoid blend lands in the dead zone (mid-tone backgrounds where averaging dark+light fails), snap to whichever direction gives better contrast.

**Hue avoidance details:**
```
Text hue far from ideal (≥60°):
  → Use ideal hue (green=120° or red=0°)

Text hue close to ideal (<60°):
  → Smoothly blend toward fallback on the opposite side
  → Smoothstep easing: no jump at boundary, full shift at center
  → Direction: always AWAY from text (two fallbacks per color)
```

**Fallback hues (directional):**
| Color | CW Fallback | CCW Fallback | Logic |
|-------|-------------|--------------|-------|
| Confirm (120°) | 210° (blue) | 60° (yellow-green) | Text CW from green → push CCW, and vice versa |
| Error (0°) | 50° (orange) | 310° (magenta) | Text CW from red → push CCW, and vice versa |

**Why two fallbacks?** A single fallback can lerp THROUGH the text hue. Example: error (0°) avoiding text at 330° with fallback 320° — the shortest arc goes 0°→340°→320°, passing right through 330°. With directional fallbacks, the algorithm picks the fallback on the opposite side (50° orange), so the path goes 0°→25°→50°, safely away from 330°.

**Constants:**
| Name | Value | Purpose |
|------|-------|---------|
| `RED_HUE` | 0° | Ideal error hue |
| `GREEN_HUE` | 120° | Ideal confirm hue |
| `SATURATION` | 100% | Maximum saturation |
| `TARGET_CONTRAST` | 3.5 | WCAG large text standard |
| `MIN_HUE_DISTANCE` | 60° | Avoidance zone radius around text hue |
| `CONFIRM_FB_CW` | 210° | Confirm → blue (text is CCW from green) |
| `CONFIRM_FB_CCW` | 60° | Confirm → yellow-green (text is CW from green) |
| `ERROR_FB_CW` | 50° | Error → orange (text is CCW from red) |
| `ERROR_FB_CCW` | 310° | Error → magenta (text is CW from red) |

Code location: `src/shared/utils/confirmColor.ts`

```tsx
import { getStatusColors } from '@shared/utils/confirmColor';
const { confirm: confirmColor, error: errorColor } = getStatusColors(
  hue, saturation, lightness,           // text color (hue used for avoidance)
  bgHue, bgSaturation, bgLightness      // background color (used for contrast)
);
```

**Used in:**
- Password success/error states (`PasswordSettings.tsx`)
- Import success/error feedback (`ExportButtons.tsx`)

### Password Input Labels

**No title labels:** Password flows have no labels above the input. The placeholder text indicates the current step:
- "set password" → "one more time" (new password flow)
- "old password" → "new password" → "new password again" (change flow)
- "saved. lock with esc." (after successful save, with bold sweep animation)

### Password Input Styling

Both LockScreen and PasswordSettings inputs use **identical styling** for consistency:

```tsx
className="w-full px-3 py-2 text-xs font-mono font-bold rounded"
style={{
  backgroundColor: getBackgroundColor(),
  border: `3px solid ${getBorderColor()}`,
  color: getBorderColor(),
  caretColor: textColor,
  outline: 'none',
}}
```

| Property | Value |
|----------|-------|
| Border | `3px solid` |
| Padding | `px-3 py-2` (12px horizontal, 8px vertical) |
| Font | `text-xs` (12px), `font-mono`, `font-bold` |
| Border radius | `rounded` (4px) |
| Width | `w-full` (100%) |

Code locations:
- `src/features/auth/components/LockScreen.tsx` (line ~147)
- `src/features/auth/components/PasswordSettings.tsx` (line ~483)

### ESC vs Click-Outside (Smart Difference)

Both reset the password flow, but with one key UX difference:

| Action | Resets Flow | Focus |
|--------|-------------|-------|
| ESC | Yes | **Keeps focus** (ready to retype) |
| Click outside | Yes | **Blurs** (you clicked away, done with input) |

This is intentional: ESC means "clear and retry", click-outside means "I'm done here".

### Implementation Details

**PasswordSettings handler (capture phase):**
- Always attached (avoids race conditions during state updates)
- Checks `showInput && !isSaving` inside handler, not in useEffect guard
- Calls `e.preventDefault()` when handling, so App.tsx skips

**App.tsx handler (bubble phase):**
- Checks `e.defaultPrevented` first
- Checks zen mode via `zenModeRef.current` (exits zen if true)
- Checks if user is in `<input>` (NOT textarea - editor ESC should lock)
- Checks minizen/narrow states
- Otherwise locks the app

### Testing Checklist

- [ ] Click "change password" → ESC → back to split buttons (no lock)
- [ ] Type old password → ESC → back to split buttons (no lock)
- [ ] At "new password" → ESC → back to "old password" (no lock)
- [ ] At "confirm" → ESC → back to "old password" (no lock)
- [ ] Password saved → ESC → locks app
- [ ] No password, "password" (focused) → ESC → clears input, keeps focus
- [ ] No password, "password" (focused) → click outside → clears input, blurs
- [ ] No password, "one more time" → ESC → back to "password", keeps focus
- [ ] No password, "one more time" → click outside → back to "password", blurs
- [ ] No password, wrong confirm → focused at "password" → ESC → clears, keeps focus
- [ ] Main editor (no panels) → ESC → locks app
- [ ] Rapid click + ESC → consistent behavior (no race condition)

# Claude Code Instructions

## Deployment

**IMPORTANT**: Always push changes to git after making code changes. Both apps deploy automatically:

- **Vercel**: https://gdays.vercel.app/ - Auto-deploys on push to `main`
- **GitHub Pages**: https://shailenparmar.github.io/good-days/ - Auto-deploys via GitHub Actions on push to `main`

After any code changes:
```bash
git add <files>
git commit -m "Description of changes"
git push origin main
```

## Domain & Hosting

The production site is hosted on **GitHub Pages** with a custom domain managed by **Cloudflare**.

### Architecture

```
User → Cloudflare DNS → GitHub Pages → serves site
```

| Component | Purpose |
|-----------|---------|
| **Cloudflare** | DNS management, domain registrar for `gdays.day` |
| **GitHub Pages** | Static site hosting, SSL certificate provisioning |
| **GitHub Actions** | Auto-deploys on push to `main` |

### DNS Records (Cloudflare)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `gdays.day` (apex) | `shailenparmar.github.io` | DNS only |
| CNAME | `www` | `shailenparmar.github.io` | **Proxied** |

Note: Cloudflare "flattens" the apex CNAME to A records (GitHub Pages IPs: 185.199.x.x).

### CNAME File

The `public/CNAME` file tells GitHub Pages which custom domain to use:

```
gdays.day
```

### Cloudflare Redirect Rule

A redirect rule handles `www.gdays.day` → `gdays.day`:

| Setting | Value |
|---------|-------|
| Name | `www to apex` |
| When | Hostname equals `www.gdays.day` |
| Then | Dynamic redirect to `https://gdays.day${http.request.uri.path}` |
| Status | 301 (permanent) |
| Preserve query string | Yes |

The `www` DNS record must be **Proxied** (orange cloud) for Cloudflare to handle SSL and the redirect.

### URLs

| URL | Purpose |
|-----|---------|
| `https://gdays.day` | Production (primary) |
| `https://www.gdays.day` | Redirects to apex via Cloudflare |
| `https://shailenparmar.github.io/good-days/` | GitHub Pages (redirects to gdays.day) |
| `https://gdays.vercel.app/` | Vercel deployment (separate) |

### Troubleshooting

**SSL cert error on www**: Ensure the `www` DNS record is **Proxied** (orange cloud) in Cloudflare, and the redirect rule is active.

**DNS not resolving**: Check Cloudflare DNS records. Apex must be DNS only, www must be Proxied.

**Changes not appearing**:
1. Check GitHub Actions completed successfully
2. Verify version number in about panel matches pushed version
3. Hard refresh (Cmd+Shift+R) to bypass cache

## Project Structure

- `src/features/` - Feature-based modules (auth, journal, theme, settings, statistics, export)
- `src/shared/` - Shared utilities and components
- `src/index.css` - Global styles including scrollbar-hide utility

## Backup & Import

The app supports exporting entries to an **encrypted** `.txt` file and importing them back.

### Backup Format

Backups are encrypted using AES-GCM with an app-embedded key. The file looks like:

```
good days encrypted backup Jan 30, 2026, 10:30 AM

U2FsdGVkX1+vupppZksvRf8Z7J9K3xH5mN2qW...
[base64 encrypted content continues]
```

The encrypted content, when decrypted, contains the plain text format:

```
# good days

---

## Monday, January 27, 2025

*Started at 09:30:00*

Entry content here...
```

### Encryption Details

- **Algorithm**: AES-GCM (256-bit key)
- **Key derivation**: PBKDF2 with fixed app secret
- **IV**: Random 12 bytes per encryption (stored with ciphertext)
- **Code location**: `src/features/export/utils/crypto.ts`

Note: This is obfuscation (prevents casual reading), not security. Anyone with source code access could decrypt backups.

### Import Conflict Handling

When importing, entries are **merged** (not replaced). If an imported entry's date already exists:

1. **Same content**: Skip (no change)
2. **Different content**: Append imported content below existing with a separator

The conflict separator format (one blank line above `---`):

```
[existing content]

---
from Jan 30, 2026, 10:30:45 AM backup:

[imported content]
```

Code location: `src/features/export/utils/parseBackup.ts`

```typescript
const importLabel = `\n\n---\nfrom ${importDate.toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
})} backup:\n\n`;
```

### Exact Match Handling

When importing, entries with **identical content** are skipped entirely (not merged). The comparison:
- Strips HTML from existing entry
- Trims whitespace from both sides
- Case-sensitive string comparison

This prevents duplicate content from being appended during repeated imports.

### Key Behaviors

- **Import only accepts encrypted backups** (files must start with `good days encrypted backup`)
- Import button is always enabled (can import into empty app)
- New dates from import are added as new entries
- `startedAt` is preserved (uses older timestamp if imported entry is older)
- Entries are re-sorted by date after import
- "Copy to clipboard" still copies plain text (not encrypted)

## UI Conventions

- All scrollable areas should use `scrollbar-hide` class to hide scrollbars
- Theme colors are HSL-based and managed via ThemeContext
- For borders, lines, and opacity values, see **Opacity Standards**, **Line Styles**, and **Powerstat Spacing** sections below
- **Cursor styles** - Default arrow cursor everywhere except selectable text. Enforced in `src/index.css`:
  ```css
  *, *::before, *::after { cursor: inherit; }
  html { cursor: default; }
  [contenteditable="true"], .cursor-text { cursor: text; }
  ```
  Use `cursor-text` class for non-editable but selectable text (e.g., color stats in powerstat).
- **A REFRESH DOES NOT CHANGE WHAT YOU SEE** - All visible UI state must be persisted to localStorage. If the user can see it before refresh, they must see it after refresh. This includes panels, sidebar visibility, zen mode, scramble state, etc.

## Editor Cursor (IMPORTANT)

The editor uses a `contentEditable` div with custom cursor styling.

### Current Implementation

The cursor is styled using CSS with the `caret-color` property set dynamically via inline styles to match the theme color.

**CSS (src/index.css):**
```css
/* Custom editor with thick caret - color is set dynamically via inline styles */
.custom-editor {
  /* caret-color set via inline style */
}

/* Try to make it blocky in supporting browsers */
@supports (caret-shape: block) {
  .custom-editor {
    caret-shape: block;
  }
}
```

**Inline style (JournalEditor.tsx):**
```tsx
<style>
  {`
    .dynamic-editor {
      caret-color: ${getColor()};
    }
  `}
</style>
```

### Browser Support

| Browser | Cursor Appearance |
|---------|-------------------|
| Chrome 144+ | Block cursor (via `caret-shape: block`) |
| Firefox | Block cursor (via `caret-shape: block`) |
| Safari | Thin line cursor (no block cursor support yet) |

**Note**: `caret-shape: block` shipped in Chrome 144 (January 2026) and has been in Firefox for longer. Safari does not yet support this property.

**TODO**: Periodically check if Safari has implemented `caret-shape: block`:
- Check https://caniuse.com/mdn-css_properties_caret-shape
- Check Safari release notes / WebKit blog
- Once supported, Safari users will automatically get block cursor (CSS already in place)

### Why Not Use a Custom JavaScript Cursor?

A custom JavaScript-based block cursor was attempted (v1.5.30) but had issues:

1. **Position tracking complexity**: Tracking cursor position in `contentEditable` requires `selectionchange` events and `getClientRects()` which can be unreliable
2. **Performance**: Requires hiding the native cursor (`caret-color: transparent`) and rendering a separate `<div>` that follows the cursor position
3. **Edge cases**: Empty editors, line breaks, text selection all need special handling
4. **Blinking behavior**: Requires managing `isTyping` state to make cursor solid while typing

If a custom cursor is needed in the future, the v1.5.30 commit has a working (but buggy) implementation that can be referenced.

### Keeping the Cursor Solid During Delete

The native browser behavior causes the cursor to blink after deletion. To keep it solid, we intercept `Backspace` and `Delete` keys and use `execCommand('insertText', '')` instead of native deletion:

```tsx
const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (e.key === 'Backspace') {
    e.preventDefault();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      if (!selection.isCollapsed) {
        document.execCommand('insertText', false, '');
      } else {
        const granularity = e.metaKey ? 'lineboundary' : e.altKey ? 'word' : 'character';
        selection.modify('extend', 'backward', granularity);
        document.execCommand('insertText', false, '');
      }
    }
  }
  // Similar for Delete key...
}, []);
```

### Ensuring Consistent Caret Rendering

An empty `contentEditable` div can have inconsistent caret rendering. A MutationObserver ensures there's always a `<br>` element:

```tsx
useEffect(() => {
  if (!editorRef.current) return;
  const ensureBr = () => {
    if (!editorRef.current.innerHTML || editorRef.current.innerHTML === '') {
      editorRef.current.innerHTML = '<br>';
    }
  };
  const observer = new MutationObserver(ensureBr);
  observer.observe(editorRef.current, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}, [editorRef]);
```

### Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| No cursor visible | `caret-color: transparent` without custom cursor | Remove `caret-color: transparent` from CSS |
| Cursor wrong color | Inline style not applied | Check `.dynamic-editor` class and inline `<style>` tag |
| Cursor blinks on delete | Not using `execCommand` approach | Use `execCommand('insertText', '')` in `handleKeyDown` |
| Cursor narrow after Enter+Delete | Empty `<div></div>` without `<br>` | `ensureBr` must check for empty structures, not just `innerHTML === ''` |

### The Enter+Delete Bug

When user presses Enter then Delete in empty editor:
1. Empty editor starts with `<br>` (correct)
2. Enter creates `<div><br></div>` (browser behavior)
3. Backspace deletes, leaving `<div></div>` (empty div, no `<br>`)
4. MutationObserver's `ensureBr` only checked `innerHTML === ''`
5. `<div></div>` is not empty string, so no `<br>` was added
6. Empty div without `<br>` = inconsistent caret (narrow instead of block)

**Fix:** Check for "no text content AND no `<br>`":
```tsx
const hasNoBr = !html.includes('<br');
const hasNoText = !editorRef.current.textContent?.trim();
if (!html || html === '' || (hasNoText && hasNoBr)) {
  editorRef.current.innerHTML = '<br>';
}
```
| Cursor jumps to end | `\time` replacement or other HTML manipulation | Restore cursor position after manipulation |

### The `\time` Cursor Position Fix

When `\time` is replaced with a timestamp, the cursor must stay where the user was typing (right after the inserted timestamp), not jump to the end of the document.

**The problem:**
1. User types `\time` anywhere in document (e.g., at top of long entry)
2. `innerHTML.replace()` changes the DOM, invalidating any saved selection ranges
3. Naive fix: put cursor at end → user loses their place and view scrolls

**The solution:**
1. Get character offset of `\time` in plain text before replacement
2. Calculate target: `offset + timestampLength`
3. After replacement, walk text nodes with TreeWalker counting characters
4. Position cursor at the target character offset

```tsx
// Find where \time is in the text
const timeIndex = textContent.toLowerCase().indexOf('\\time');
const timestampText = `[${timestamp}]`;
const cursorTargetOffset = timeIndex + timestampText.length;

// Replace only the FIRST occurrence (matches cursor calculation)
editorRef.current.innerHTML = editorRef.current.innerHTML.replace(/\\time/i, timestampText);

// Walk text nodes to find correct cursor position
let currentOffset = 0;
let cursorSet = false;
const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
let node: Text | null;
while ((node = walker.nextNode() as Text | null)) {
  const nodeLength = node.textContent?.length || 0;
  if (currentOffset + nodeLength >= cursorTargetOffset) {
    const range = document.createRange();
    range.setStart(node, cursorTargetOffset - currentOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    cursorSet = true;
    break;
  }
  currentOffset += nodeLength;
}
// Fallback: put cursor at end if target not found
if (!cursorSet) {
  range.selectNodeContents(editorRef.current);
  range.collapse(false);
}
```

**Key design decisions:**
- **Replace first occurrence only** (`/\\time/i` not `/\\time/gi`): If user pastes multiple `\time`, we replace one at a time. Each keystroke that completes a `\time` replaces just that one.
- **Character offset approach**: DOM node references become invalid after innerHTML change, but character positions remain consistent.
- **Fallback to end**: If TreeWalker can't find target (edge case: timestamp at very end with only `<br>` after), cursor goes to end rather than nowhere.
- **Compatible with scramble mode**: Fix only touches `editorRef`, not the scramble overlay. MutationObserver updates overlay automatically.

### Key Files

| File | Purpose |
|------|---------|
| `src/index.css` | CSS for `.custom-editor` including `caret-shape: block` |
| `src/features/journal/components/JournalEditor.tsx` | Editor component with cursor handling |

## Scramble Mode

Scramble mode obfuscates entry text to prevent over-the-shoulder reading.

### Behaviors

- **Persists across entries** - Scramble stays on when navigating between dates
- **Persists across refresh** - Stored in localStorage as `isScrambled`
- **Hotkey** - Option+S (Mac) / Alt+S (Windows) toggles scramble when hotkey is activated

### Scramble Hotkey

The scramble hotkey is a power user feature, only available in **powerstat mode** (settings + about panels both open).

| State | Button Text | On Hover |
|-------|-------------|----------|
| Deactivated | "scramble hotkey deactivated" | "option/alt + s" |
| Activated | "scramble hotkey activated" | "option/alt + s" |

When activated, Option/Alt+S toggles scramble from anywhere in the app.

Code location: `src/App.tsx` (hotkey listener), `src/features/settings/components/SettingsPanel.tsx` (toggle button)

## Power Modes

The app has special modes that activate when multiple panels are open.

### Powerstat Mode

**Trigger**: Settings + About panels both open

| Feature | Description |
|---------|-------------|
| About panel shrinks | Width goes from 675px → 400px |
| Scramble hotkey toggle | Button appears in Settings to enable Option/Alt+S hotkey |
| Horizontal stats | StatsDisplay switches to horizontal layout |
| Reset app button | Appears at bottom of Settings panel |
| Easter egg tracking | `powerstatMode` is marked as found |

### Reset App Button

Only visible in powerstat mode. Three-step confirmation:

1. "reset app" → click
2. "are you sure?" → click
3. "are you sure you're sure?!" → click → clears localStorage + IndexedDB, reloads

**Behavior**: Moving mouse off the button at any step resets back to "reset app".

Code location: `src/features/settings/components/SettingsPanel.tsx`

### Powerscramble Mode

**Trigger**: Scramble ON + Settings + About all active together (internally called `isSuperscramble`)

Includes all powerstat features, plus:

| Feature | Description |
|---------|-------------|
| Theme randomizes on keystroke | Each character typed randomizes the colorway |
| Global re-scramble on keystroke | All scrambled text re-randomizes on input |
| Time tracking paused | Stats timer pauses to prevent jitter |
| All UI text scrambled | Title, buttons, stats, sidebar entries all scramble |
| Easter egg tracking | `superscramble` is marked as found |

Code location: `src/App.tsx` (isSuperscramble definition, line ~110)

## Panel Dimensions

| Panel | Width | Resizable |
|-------|-------|-----------|
| Sidebar | 320px (`w-80`) | No |
| Settings | 320px (`w-80`) | No |
| About | 675px (400px in powerstat/powerscramble) | No |

## Opacity Standards

All opacities in the app follow this hierarchy:

| Tier | Opacity | Use |
|------|---------|-----|
| **Full** | 100% | Text content, active states |
| **Strong** | 85% | Panel lines, dividers, placeholders, link hover |
| **Medium** | 60% | Resting borders (buttons/inputs) |
| **Muted** | 50% | Disabled states |
| **Subtle** | 20% | Hover backgrounds |

### Where Each Opacity Appears

**85% opacity:**
- Panel lines (6px borders): `hsla(..., 0.85)`
- Dividers (2px borders): `hsla(..., 0.85)`
- Placeholder text: `opacity: 0.85`
- Link hover: `hover:opacity-85`

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

Used on: stats section separators in powerstat mode.

## Powerstat Spacing

The stats display in powerstat mode uses these specific spacing values:

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

## Mobile Screen

On mobile devices, the app shows a simple screen with "good days is not supported on mobile yet" and a rand button.

### Layout

```
┌────────────────────────────────┐
│                                │
│        ← 120px marginTop       │
│                                │
│            good                │
│            days                │
│             is                 │
│            not                 │  ← 4px between words
│         supported              │
│             on                 │
│           mobile               │
│            yet                 │
│                                │
│        ← 60px gap              │
│                                │
│         ┌──────────┐           │
│         │   rand   │           │  ← 8px border
│         └──────────┘           │
│                                │
│        ← 48px marginBottom     │
│                                │
└────────────────────────────────┘
```

### Spacing Values

| Element | Property | Value |
|---------|----------|-------|
| Text from top | `marginTop` | 120px |
| Between words | `margin` | 4px 0 |
| Text to button | `marginTop` on button | 60px |
| Button to bottom | `marginBottom` | 48px |
| Button border | `border` | 8px solid |
| Button border radius | `borderRadius` | 12px |
| Button padding | `padding` | 8px 40px |

### Why Fixed Pixels?

The layout uses fixed pixel values instead of flex-based positioning because:
- `flex` values render differently across browsers (Chrome vs Safari)
- Fixed pixels ensure consistent appearance on all devices

Code location: `src/main.tsx`

## Color Presets

Default presets are defined in `src/features/theme/context/ThemeContext.tsx`:

| Preset | Text Color | Background Color | Description |
|--------|------------|------------------|-------------|
| **1** | hsl(175, 100%, 21%) teal | hsl(84, 100%, 88%) light green | Default for new users |
| **2** | hsl(241, 69%, 47%) blue | hsl(59, 100%, 66%) yellow | — |
| **3** | hsl(360, 100%, 49%) red | hsl(360, 100%, 13%) dark red | — |
| **4** | hsl(229, 61%, 100%) white | hsl(251, 100%, 59%) purple | — |
| **5** | hsl(116, 100%, 53%) bright green | hsl(96, 100%, 0%) black | — |

### New User Defaults

New users see **Preset 1** (teal on light green). Two places set this:

1. **React defaults**: `ThemeContext.tsx` uses `DEFAULT_PRESETS[0]` for initial state
2. **HTML fallbacks**: `index.html` has hardcoded values for pre-React page load (prevents flash)

When changing the default preset, update BOTH locations.

### Error Screen

The error boundary (`src/shared/components/ErrorBoundary.tsx`) uses hardcoded colors:
- Text: `hsl(116, 100%, 53%)` - bright green (#1fff0f)
- Background: `hsl(0, 0%, 0%)` - black (#000000)

These are intentionally NOT tied to presets so the error screen always displays consistently.

### Preset Keyboard Navigation

When settings is open, presets can be controlled with the keyboard:

| Key | Action |
|-----|--------|
| Arrow keys | Navigate between presets (auto-applies on move) |
| Space / Enter | Save current colors to the active preset |
| Backspace / Delete | Delete the active preset |

#### Editor Auto-Focus Protection

The app has a "type anywhere to focus editor" feature. When you press a key, it auto-focuses the editor so you can start typing.

When settings is open (whether just settings, powerstat, or powerscramble), Space/Enter/Backspace must NOT trigger this auto-focus. These keys are reserved for preset controls. This is handled in `App.tsx`:

```tsx
// When settings open, protect Enter/Backspace/Space from focusing editor (for preset controls)
if (showDebugMenu && (e.key === 'Enter' || e.key === 'Backspace' || e.key === ' ')) return;
```

**Important distinction:** This protection only prevents these keys from *focusing* the editor. Once you're already focused in the editor, all keys work normally (Backspace deletes characters, Space adds spaces, Enter adds newlines).

#### Pulse Animation Reset

Active presets show a pulsing border animation (`preset-pulse` class). When you press Space/Enter to save colors to a preset, the animation resets to give visual feedback. This is done by incrementing a `pulseKey` state that's part of each button's React key.

Code location: `src/features/theme/components/PresetGrid.tsx`

## Font Sizes

| Name | Size | Class | Elements |
|------|------|-------|----------|
| **title** | 24px | `text-2xl font-extrabold` | "good days" title, lock screen corners |
| **heading** | 18px | `text-lg font-extrabold` | Date header ("jan 30, 2025") |
| **body** | 16px | `text-base font-bold` | Editor text, placeholder, about panel |
| **label** | 14px | inline `fontSize: '14px'` | Sidebar buttons, entry dates, footer, "started at" |
| **caption** | 12px | `text-xs font-bold` | Stats, settings controls, password inputs, presets |

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

### State Variables (in App.tsx)

| Variable | Purpose | Persisted | Default |
|----------|---------|-----------|---------|
| `isNarrow` | `true` when window < 711px | No (computed) | — |
| `zenMode` | Full zen: just editor, hide everything else | Yes | `false` |
| `minizen` | Minizen: hide sidebar, keep header+footer (wide only) | Yes | `false` |
| `showSidebarInNarrow` | Override to show sidebar in narrow mode | No | `false` |
| `preFocusState` | Saved state before entering zen/minizen (for restore) | No | `null` |
| `preNarrowState` | Saved panel state before narrowing (for restore on widen) | No | `null` |
| `showDebugMenu` | Settings panel open | Yes | `false` |
| `showAboutPanel` | About panel open | Yes | `false` |

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

| Current State | Action | Next State | `preZenState` |
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

| Current State | Action | Next State | `preZenState` |
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

ESC escapes through focus states before locking:

| Current State | ESC Result |
|---------------|------------|
| In input field | Nothing |
| Password flow active | Back one step |
| Zen (any mode) | Restore pre-zen state |
| Wide + Minizen | Exit minizen (show sidebar) |
| Wide + Full | Lock app |
| Narrow + Default | Show sidebar |
| Narrow + Sidebar Visible | Lock app |

**ESC flow in wide mode:**
```
Zen → ESC → (previous state)
Minizen → ESC → Full
Full → ESC → Lock
```

**ESC flow in narrow mode:**
```
Zen → ESC → (previous state)
Default → ESC → Sidebar Visible
Sidebar Visible → ESC → Lock
```

### Resize Transitions

Panel state is preserved across resize using `preNarrowState`.

#### Wide → Narrow

| Before | After | Reason |
|--------|-------|--------|
| Full | Default | Sidebar becomes overlay-style in narrow |
| Minizen | Default | Same visual (no sidebar, has header+footer) |
| Zen | Zen | Stay in zen |
| Panels open | Panels closed (saved) | No room, but state saved for restore |

**State changes:**
- `preNarrowState` saves `{ showDebugMenu, showAboutPanel }`
- `minizen = false` (reset)
- `showSidebarInNarrow = false` (reset)
- `closePanels()` (close settings/about)
- `zenMode` preserved (if in zen, stay in zen)

#### Narrow → Wide

| Before | After | Reason |
|--------|-------|--------|
| Default | Full | Show sidebar by default in wide |
| Sidebar Visible | Full | Sidebar is normal in wide |
| Zen | Zen | Stay in zen |
| Panels were open before narrow | Panels restored | State restoration from preNarrowState |

**State changes:**
- `preNarrowState` restored → panels reopen if they were open
- `minizen = false` (reset to show sidebar)
- `showSidebarInNarrow = false` (reset)
- `zenMode` preserved (if in zen, stay in zen)

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
| Footer | Toggle zen | Toggle zen |
| Editor (in zen) | Exit to minizen | Exit to default |
| Sidebar area | Close panels | Close panels |
| Sidebar overlay | N/A | Close sidebar + panels |

### Code: State Transitions

```tsx
// State to remember where user was before zen
const [preZenState, setPreZenState] = useState<{
  minizen: boolean;
  showSidebarInNarrow: boolean;
} | null>(null);

// Header click - toggle sidebar/minizen
const handleHeaderClick = () => {
  closePanels();
  if (isNarrow) {
    setShowSidebarInNarrow(!showSidebarInNarrow);
  } else {
    setMinizen(!minizen);
  }
};

// Footer click - toggle zen
const handleFooterClick = () => {
  closePanels();
  if (!zenMode) {
    // Entering zen: save current state
    setPreZenState({ minizen, showSidebarInNarrow });
    setZenMode(true);
  } else {
    // Exiting zen: restore saved state
    exitZen();
  }
};

// Exit zen - restore previous state
const exitZen = () => {
  setZenMode(false);
  if (preZenState) {
    setMinizen(preZenState.minizen);
    setShowSidebarInNarrow(preZenState.showSidebarInNarrow);
    setPreZenState(null);
  }
};

// ESC key
const handleEsc = () => {
  if (zenMode) {
    exitZen();
    return;
  }
  // Otherwise lock app
  auth.lock();
};

// Click in editor while in zen
const handleEditorClickInZen = () => {
  if (zenMode) {
    exitZen();
  }
};
```

### Key Principles

1. **Focus modes are fully reversible** - Exiting any focus mode restores the exact prior state, including open panels
2. **Footer = zen toggle** - Footer click enters/exits zen in both modes
3. **Header = sidebar toggle** - Header click toggles sidebar visibility (minizen in wide, overlay in narrow)
4. **Zen survives resize** - If in zen, stay in zen across breakpoint
5. **preZenState captures full context** - Includes `minizen`, `showSidebarInNarrow`, `showDebugMenu`, `showAboutPanel`

### State Restoration Framework

Any action that hides UI elements must save the full layout state and restore it on exit.

**State variable**: `preFocusState` (in App.tsx)

```tsx
// Full layout state to remember
const [preFocusState, setPreFocusState] = useState<{
  minizen: boolean;
  showSidebarInNarrow: boolean;
  showDebugMenu: boolean;
  showAboutPanel: boolean;
} | null>(null);
```

**Functions**:
- `enterZen()` / `exitZen()` - Save/restore when entering/exiting zen mode
- `enterMinizen()` / `exitMinizen()` - Save/restore when entering/exiting minizen

**The rule**: If settings was open → zen → exit zen = settings open again. Same for minizen.

## ESC Key Behavior (IMPORTANT)

ESC key has context-dependent behavior. Two handlers coordinate this:

### Handler Architecture

| Handler | Location | Phase | Purpose |
|---------|----------|-------|---------|
| Password flow | `PasswordSettings.tsx` | Capture (runs first) | Reset password flow, call `preventDefault()` |
| App handler | `App.tsx` | Bubble (runs second) | Exit zen or lock app |

### ESC Priority (checked in order)

1. **Password flow active** → Reset flow (handled by PasswordSettings)
2. **User in input field** → Do nothing
3. **Zen mode active (wide)** → Exit zen mode
4. **Otherwise** → Lock app

### When ESC Should NOT Lock

1. **User is in an input field** - Check `document.activeElement.tagName`
2. **Password flow is active** - `showInput && !isSaving` in PasswordSettings
3. **ESC was already handled** - Check `e.defaultPrevented`
4. **In zen mode (wide)** - Exit zen instead of locking

### When ESC SHOULD Lock

1. **Main editor view** - No panels open, not in input, not in zen
2. **After password saved** - Label says "esc to lock", `isSaving=true`
3. **Split buttons visible** - No password flow in progress

### Password Flow ESC Behavior

| State | `showInput` | `isSaving` | ESC Result |
|-------|-------------|------------|------------|
| Split buttons | `false` | `false` | Lock (no flow active) |
| "old password" step | `true` | `false` | → Split buttons |
| "new password" step | `true` | `false` | → "old password" |
| "confirm" step | `true` | `false` | → "old password" |
| "password" (set) | `true` | `false` | Blur input (show placeholder) |
| "one more time" (set-confirm) | `true` | `false` | → "type here" |
| "password saved" | `true` | `true` | Lock (handler skips) |

### Click-to-Dismiss Behavior

Password flows can also be dismissed by clicking outside the input:

- **After "password saved"** - Click anywhere dismisses message and returns to split buttons
- **During "change password" flow** - Click outside input returns to split buttons
- **During "set password" flow** - Click outside input resets to first step and blurs

### Password Confirm Colors

The password input flashes a confirm color on successful entry. To maintain contrast:

| Theme Color | Confirm Color | Hex |
|-------------|---------------|-----|
| Green (hue 80-160) | Cyan | `#0ffffb` |
| Any other color | Green | `#00ff00` |

This affects:
- **Border** - flashes confirm color on success
- **Input text** - changes to confirm color during flash
- **"password saved" text** - displays in confirm color
- **"lock with esc" label** - displays in confirm color after save

Code location: `src/features/auth/components/PasswordSettings.tsx`

```tsx
const isThemeGreen = hue >= 80 && hue <= 160;
const confirmColor = isThemeGreen ? '#0ffffb' : '#00ff00';
```

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
- Checks if user is in input/textarea
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
| `children` | `ReactNode` | Button content (text, icons) |

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

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS

## Pre-push Hook

A pre-push hook runs `npm run typecheck` before every push to prevent CI failures. This catches TypeScript errors locally before they hit CI.

To install (first time setup):
```bash
./scripts/setup-hooks.sh
```

If a push is blocked, fix the TypeScript errors shown and try again.

## App Icons (IMPORTANT - Prevents macOS/iOS Shading)

When creating or modifying app icons, follow these rules to prevent macOS/iOS from applying dark shading effects:

### Icon Files

| File | Purpose | Design |
|------|---------|--------|
| `icon.svg` | Favicon (browser tab) | Rounded corners OK, transparent background OK |
| `apple-touch-icon.png` | iOS/macOS dock | **Square** (OS rounds corners automatically) |
| `icon-192.png` | Android/PWA | **Square** |
| `icon-512.png` | Android/PWA | **Square** |
| `og-image.png` | Social sharing | Icon on white background |

### Current Icon Colors

| Element | Color | HEX |
|---------|-------|-----|
| Inner square | Green | `#1FFF0F` |
| Border/background | Black | `#000000` |

### PNG Icon Requirements (Critical)

To prevent macOS from adding dark shading to icons:

1. **Use HEX colors** in SVG source (not HSL)
   ```svg
   fill="#0000EB"  <!-- Good -->
   fill="hsl(241, 100%, 46%)"  <!-- Bad - may cause issues -->
   ```

2. **No embedded color profile** - just plain RGB
   - `space: RGB` (not sRGB IEC61966-2.1)
   - `samplesPerPixel: 3`

3. **No alpha channel**
   - `hasAlpha: no`

4. **Fill entire canvas** - no transparency for dock icons
   - The OS applies rounded corners automatically
   - Transparent areas trigger OS "enhancement" effects

Verify with: `sips -g hasAlpha -g space -g samplesPerPixel <icon>.png`

### Manifest Config (vite.config.ts)

```typescript
manifest: {
  background_color: '#000000',  // Keep black - other colors may tint icons
  // Do NOT set theme_color in manifest (causes issues)
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
}
```

Key points:
- `background_color: '#000000'` - other colors (like yellow) caused shading
- `purpose: 'any'` - NOT `maskable` (maskable triggers 3D effects)
- Don't include apple-touch-icon in manifest (it's linked in HTML separately)

### Generating Icons

```bash
# Create SVG with HEX colors, then:
cd public
rsvg-convert -w 180 -h 180 icon-source.svg -o apple-touch-icon.png
rsvg-convert -w 192 -h 192 icon-source.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon-source.svg -o icon-512.png

# Do NOT embed color profiles - leave as plain RGB
```

### Backup

Original working icons backed up at `public/icon-backup/` for reference.

## Easter Eggs

The app has 14 discoverable easter eggs + 1 secret final egg. The count displays in powerstat mode.

### Easter Egg List

| # | ID | How to Trigger |
|---|-----|----------------|
| 1 | `scrambleTyping` | Type while in scramble mode |
| 2 | `powerstatMode` | Open settings + about panels together |
| 3 | `superscramble` | Settings + about + scramble all active |
| 4 | `superscrambleTyping` | Type while in superscramble (theme randomizes) |
| 5 | `scrambleHotkeyOn` | Activate the scramble hotkey in powerstat |
| 6 | `minizenMode` | Enter minizen mode (click header in wide mode) |
| 7 | `zenMode` | Enter zen mode (click footer) |
| 8 | `timeCommand` | Use `\time` in the editor |
| 9 | `scrambleHotkeyUsed` | Actually use the scramble hotkey (Option/Alt+S) |
| 10 | `spacebarRand` | Press spacebar while on rand button in preset grid |
| 11 | `arrowKeyPresets` | Navigate presets with arrow keys |
| 12 | `copyMarkdown` | Copy markdown format in powerstat mode |
| 13 | `selectColorText` | Click on the color stats area (HSL/HEX values) |
| 14 | `resetBlackout` | See the blackout screen on reset confirmation |
| SECRET | `clickedEggCounter` | Click on "13.5/14" to complete (see below) |

### The 13.5/14 Gag

When the user finds all 14 regular eggs, the counter shows **"13.5/14 easter eggs"** instead of "14/14". The final egg is clicking on this incomplete counter:

1. User finds all 14 regular eggs → shows "13.5/14"
2. User clicks "13.5/14" → marks secret egg + rainbow animation + bold sweep animation
3. Counter now shows "14/14"

**The gag**: The 14th egg IS clicking on the counter. You can't complete the collection without clicking it.

After completing, clicking "14/14" replays both animations. Click anywhere or press any key to stop.

### Easter Egg Click Animation

When clicking "14/14 easter eggs", two animations play simultaneously:

1. **Rainbow mode**: Text color cycles through hue 0-360° (5 second full cycle)
2. **Bold sweep**: Text does the signature bold left→right, unbold left→right animation (loops continuously)

Both animations run while rainbow mode is active and stop together when user clicks or presses a key.

The bold sweep is tied to `isRainbowMode`:
- When `isRainbowMode` becomes true → animation starts
- Animation loops (bold phase → unbold phase → bold phase → ...)
- When `isRainbowMode` becomes false → animation stops and resets to idle

### Code Location

| File | Purpose |
|------|---------|
| `src/shared/utils/easterEggs.ts` | Egg definitions, tracking, count logic |
| `src/features/statistics/components/StatsDisplay.tsx` | Display logic, 13.5 gag, rainbow animation |

### Implementation Notes

- `getEasterEggCount()` returns `total: 14` (hides the secret 15th egg)
- `isEasterEggFound('clickedEggCounter')` checks if secret is found
- Display shows "13.5" when `found === total && !hasSecretEgg`
- Rainbow mode: hue cycles 360° in 5 seconds, stops on click/keypress

## Versioning

**CRITICAL**: EVERY push to main MUST increment the version number. No exceptions. This allows the user to verify they're seeing the latest deployed build.

The version number is stored in `src/App.tsx` as `const VERSION = 'x.y.z'`.

When pushing changes:
1. **ALWAYS increment the version number** in `src/App.tsx` before pushing
   - Patch (x.y.Z): Bug fixes, small tweaks, any change at all
   - Minor (x.Y.0): New features, non-breaking changes
   - Major (X.0.0): Breaking changes, major rewrites
2. **Tell the user the version number** after pushing (e.g., "Pushed **v1.0.1**")
3. Use the version in the commit message (e.g., "v1.0.1: Fix editor focus issue")

The version displays in the app title ("good days v1.0.1") only when the about panel is open.

This lets the user verify which build is deployed by opening the about panel and checking the version. If the version doesn't match, they know the deploy hasn't completed or there's a cache issue.

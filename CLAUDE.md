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

**DOCUMENT WITH EVERY PUSH**: Update this CLAUDE.md file whenever making changes that affect:
- UI behavior or styling
- Keyboard shortcuts or interactions
- State management patterns
- Any logic that future development should know about

Don't wait to be asked - document proactively with each push.

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

When importing, entries with **identical content** are skipped entirely (not merged). The comparison uses whitespace normalization to handle HTML/plaintext differences:

```typescript
// Strip HTML preserving line breaks (</div> and <br> become \n)
function stripHtml(html: string): string {
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n');
  const div = document.createElement('div');
  div.innerHTML = withLineBreaks;
  return div.textContent || '';
}

// Normalize whitespace for comparison (collapse all \s+ to single space)
function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
```

**Why this matters:** HTML `<div>Hello</div><div>World</div>` and plain text `Hello\nWorld` must match. Without line break preservation, `textContent` produces `HelloWorld` (no space), which doesn't match `Hello World` after normalization.

**Comparison flow:**
1. Strip HTML from existing entry (preserving line breaks as `\n`)
2. Normalize both existing and imported text (collapse whitespace)
3. Check: same content? → skip. Contains imported? → skip. Otherwise → append.

This prevents duplicate content from being appended during repeated imports.

### Key Behaviors

- **Import only accepts encrypted backups** (files must start with `good days encrypted backup`)
- **Multi-file import** - Select multiple backup files at once, all processed and merged
- Import button is always enabled (can import into empty app)
- New dates from import are added as new entries
- `startedAt` is preserved (uses older timestamp if imported entry is older)
- Entries are re-sorted by date after import
- "Copy to clipboard" still copies plain text (not encrypted)

### Button Text

| Mode | Button | Default Text | On Hover |
|------|--------|--------------|----------|
| Normal | Copy | "copy to clipboard" | — |
| Normal | Backup | "backup" | — |
| Normal | Import | "import backup" | — |
| Powerstat | Copy | "copy markdown format" | — |
| Powerstat | Backup | "AES-256-GCM backup" | — |
| Powerstat | Import | "import AES-256-GCM backup" | "multiple files accepted" |

The import button hover text change in powerstat mode is a literal string change (not a tooltip - we don't use tooltips).

### Fearless Import Philosophy

**Import should require zero mental overhead.** Users should be able to select an entire folder of backups - from different dates, different devices, with overlapping content - and just import them all. The app figures it out.

No duplicate content. No corruption. No "did I already import this?" No thinking required.

**Safeguards:**
1. Same date + identical content → skip entirely
2. Same date + existing already contains imported text → skip (prevents re-appending)
3. Same date in multiple files → handled (Set tracks what's been added)
4. Multi-file import → all merge cleanly into one result

**Result:** User can import the same backup 10 times, import overlapping backups, import their entire backup folder - it just works.

### Import Feedback

After import, the import button shows feedback:

| State | Text | Color |
|-------|------|-------|
| Success | "X entry/entries imported" | Confirm color (cyan/green) |
| Failure | "import failed" | Red `#ff0000` |

**Behaviors:**
- No hover shading when feedback is showing
- Dismiss by: clicking button, clicking anywhere, or pressing any key

**Confirm color logic** (based on BACKGROUND color for visibility):
```typescript
const isBgGreen = bgHue >= 80 && bgHue <= 160;
const confirmColor = isBgGreen ? '#0ffffb' : '#00ff00';
```

- Green background (bgHue 80-160) → cyan `#0ffffb`
- Other background colors → green `#00ff00`

**IMPORTANT:** Uses `bgHue` (background), not `hue` (text). The confirm color appears ON the background, so we check background hue for visibility.

**Count reflects actual changes:**
- Importing same backup twice → "0 entries imported" (nothing changed)
- New entries + modified entries are counted
- Skipped (identical content) entries are not counted
- Multi-file import shows combined total across all files

**Failure triggers:**
- File doesn't start with `good days encrypted backup` header
- Decryption fails (corrupted or wrong format)

Code location: `src/features/export/components/ExportButtons.tsx`

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

Code locations:
- `src/features/settings/components/SettingsPanel.tsx`
- `src/features/settings/components/AboutPanel.tsx`
- `src/features/journal/components/JournalEditor.tsx`

## Editor Implementation

### Backup Branch

**IMPORTANT**: The contentEditable implementation is preserved in branch `backup/contenteditable-editor-v1.5.107`.

To restore if textarea implementation has issues:
```bash
git checkout backup/contenteditable-editor-v1.5.107 -- src/features/journal/components/JournalEditor.tsx
```

### Why Textarea Over ContentEditable

The original contentEditable implementation had persistent issues:
- Cursor jumping to start of document on backspace
- Inconsistent DOM structures (`<div>`, `<br>`, text nodes)
- `document.execCommand` is deprecated and browser-inconsistent
- `selection.modify` unreliable across line breaks
- Each fix created new edge cases

Textarea advantages:
- `value` is just a string, no DOM traversal
- Cursor position is simple numbers (`selectionStart`/`selectionEnd`)
- No line break structure issues
- `caret-shape: block` works on textarea (Chrome 144+, Firefox)

### Features Preserved in Textarea

All these work with textarea:
- `\time` command (pattern match on value string)
- Auto-focus on keypress (focus textarea on window keydown)
- Block keys when settings open (same preventDefault logic)
- Block cursor (`caret-shape: block` CSS)
- Scramble mode (overlay div over textarea, scroll-synced)
- Alt/Cmd+Backspace (delete word/line) - browser native
- Cmd+Z undo/redo - browser native

### Features Removed

- Custom tab/space wrapping (was causing bugs)
- Smart 4-space backspace deletion
- Solid cursor on delete (tradeoff: blinks but undo works)

### Key Tradeoffs

| Feature | Before (contentEditable) | Now (textarea) |
|---------|-------------------------|----------------|
| Cursor on delete | Solid (custom handling) | Blinks (native) |
| Undo/Redo | Broken | Works (native) |
| Tab key | Inserted 4 spaces | Does nothing (blocked) |
| Complexity | 607 lines, many edge cases | 270 lines, simple |

### Current Behavior

**Browser handles natively:**
- All text input and deletion
- Alt+Backspace (delete word)
- Cmd+Backspace (delete to line start)
- Cmd+Z / Cmd+Shift+Z (undo/redo)
- Selection, copy/paste

**We intercept:**
- Tab key only (preventDefault, does nothing - prevents focus leaving editor)

### Scramble Mode

When `isScrambled` is true:
1. Textarea text color is transparent
2. Overlay div shows scrambled text
3. Scroll position synced via `translateY(-${scrollTop}px)`
4. Scrambled text is memoized (`useMemo`) to prevent re-scrambling on every render

### HTML Migration

Old contentEditable entries stored HTML (`<br>`, `<div>`, etc.). On load, `stripHtml()` converts to plain text:
```typescript
const stripHtml = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>\s*<div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    // ... entity decoding
};
```

## Editor Cursor

The editor uses a `<textarea>` with CSS cursor styling.

### Cursor Styling

```tsx
// In JournalEditor.tsx
<style>
  {`
    .journal-textarea {
      caret-color: ${getColor()};
    }
    @supports (caret-shape: block) {
      .journal-textarea {
        caret-shape: block;
      }
    }
  `}
</style>
```

### Browser Support

| Browser | Cursor Appearance |
|---------|-------------------|
| Chrome 144+ | Block cursor |
| Firefox | Block cursor |
| Safari | Thin line (no `caret-shape` support yet) |

### Cursor Blink on Delete

The cursor blinks when deleting text. This is intentional - we let the browser handle deletion natively so that:
- Cmd+Z undo works correctly
- Alt+Backspace (delete word) works
- Cmd+Backspace (delete to line start) works

**Previously attempted:** Intercepting Backspace/Delete with `setRangeText()` kept cursor solid but broke undo. Tradeoff: blink is acceptable, working undo is essential.

### Troubleshooting

| Issue | Fix |
|-------|-----|
| Cursor wrong color | Check inline `<style>` tag in JournalEditor |
| No block cursor | Browser may not support `caret-shape: block` (Safari) |
| Cursor blinks on delete | Expected behavior (tradeoff for working undo) |

### Key Files

| File | Purpose |
|------|---------|
| `src/features/journal/components/JournalEditor.tsx` | Textarea editor, scramble overlay, `\time` command |

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

The colorstats area is the only protected region in powerstat mode. This allows copy/paste of color values while still letting users click anywhere else to dismiss panels.

Code locations:
- Sidebar container: `src/App.tsx` (line ~522, `onClick={closePanels}`)
- Colorstats protection: `src/features/statistics/components/StatsDisplay.tsx` (inner grid div with `stopPropagation`)
- Panel click handlers: `SettingsPanel.tsx` and `AboutPanel.tsx` (`onClick={onCloseAbout/onCloseSettings}`)

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

## Color Stats Copy/Paste

In powerstat mode, the color stats area (txt/bg HSL and HEX values) shows copy/paste buttons on hover.

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
| Not hovered | Color stats: `txt: H, S%, L%` and HEX values |
| Hovered | Split buttons: `copy` (left) / `paste` (right) |

**Copy**: Copies both colors to clipboard in format:
```
txt: 120, 50%, 60%
bg: 200, 80%, 90%
```

**Paste**: Reads clipboard, parses color values, applies them, creates new preset.

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
│        ← 16px gap              │
│                                │
│         ┌──────────┐           │
│         │  paste   │           │  ← 8px border
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
| Text to rand button | `marginTop` on button | 60px |
| Rand to paste gap | `marginTop` on paste | 16px |
| Paste to bottom | `marginBottom` | 48px |
| Button border | `border` | 8px solid |
| Button border radius | `borderRadius` | 12px |
| Button padding | `padding` | 8px 40px |

### Paste Button

The paste button reads color stats from the clipboard using the same format as powerstat mode:

```
txt: 120, 50%, 60%
bg: 200, 80%, 90%
```

**Supported formats:**
- `txt: h, s%, l%` - text color HSL
- `bg: h, s%, l%` - background color HSL
- `h, s%, l%` - plain HSL (applies to text)
- `#rrggbb` - HEX (converts to HSL, applies to text)

**Behavior:**
- Reads clipboard on tap
- Parses each line for color values
- Applies found colors (keeps existing if line not found)
- Triggers pulse animation on success
- Haptic feedback on supported devices

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
| **2** | hsl(229, 61%, 100%) white | hsl(251, 100%, 59%) purple | — |
| **3** | hsl(360, 100%, 49%) red | hsl(360, 100%, 13%) dark red | — |
| **4** | hsl(241, 69%, 47%) blue | hsl(59, 100%, 66%) yellow | — |
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

Active presets show a pulsing border animation (`preset-pulse` class). When you save colors to a preset (via Space/Enter or clicking an already-active preset), the animation resets to give visual feedback. This is done by incrementing a `pulseKey` state that's part of each button's React key.

Code location: `src/features/theme/components/PresetGrid.tsx`

#### Keyboard Hint Text

When the hint appears (after clicking presets a few times), it shows:
```
navigate with arrow keys.
select with spacebar.
delete with backspace.
```

The bold sweep animation runs across all three lines sequentially.

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
| `showSidebarInNarrow` | Override to show sidebar in narrow mode | No | `false` (but `true` on load if panels are open) |
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

1. **Password flow active** → Reset flow (handled by PasswordSettings, capture phase)
2. **Zen mode** → Exit zen (FIRST check in App.tsx - works even when typing in editor!)
3. **User in password input** → Do nothing (only `<input>`, NOT `<textarea>`)
4. **Minizen mode** → Exit minizen
5. **Narrow + sidebar hidden** → Show sidebar
6. **Otherwise** → Lock app

**IMPORTANT:** Zen mode check comes BEFORE the input check. This ensures ESC exits zen even when the user is focused in the editor textarea.

### Ref Pattern for Zen Mode

The ESC handler uses a ref to track `zenMode` to avoid stale closure issues:

```tsx
// Ref to track zenMode (always current)
const zenModeRef = useRef(zenMode);
useEffect(() => { zenModeRef.current = zenMode; }, [zenMode]);

// ESC handler uses ref, not closure variable
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (zenModeRef.current) {  // ← always current value
      exitZen();
      return;
    }
    // ... rest of handler
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [/* zenMode NOT in deps - we use ref instead */]);
```

This pattern ensures the handler always sees the current zenMode value without re-registering on every state change.

### When ESC Should NOT Lock

1. **Password flow is active** - `showInput && !isSaving` in PasswordSettings
2. **ESC was already handled** - Check `e.defaultPrevented`
3. **In zen mode** - Exit zen instead of locking
4. **In minizen mode** - Exit minizen instead of locking
5. **User in password input** - Only blocks `<input>` elements, NOT the editor `<textarea>`

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

- **After "password saved"** - Click anywhere or press any key dismisses message and returns to split buttons
- **During "change password" flow** - Click outside input returns to split buttons
- **During "set password" flow** - Click outside input resets to first step and blurs

**Implementation note:** The click handler uses capture phase (`addEventListener(..., true)`) so it runs before `stopPropagation()` calls in buttons/pickers. This ensures clicking *anywhere* outside the input triggers the dismiss.

### Password Confirm Colors

The password input flashes a confirm color on successful entry. To maintain contrast against the BACKGROUND:

| Background Color | Confirm Color | Hex |
|------------------|---------------|-----|
| Green (bgHue 80-160) | Cyan | `#0ffffb` |
| Any other color | Green | `#00ff00` |

This affects:
- **Border** - flashes confirm color on success
- **Input text** - changes to confirm color during flash
- **"saved. lock with esc"** - animated text displays in confirm color after save

**No title labels:** Password flows have no labels above the input. The placeholder text indicates the current step:
- "set password" → "one more time" (new password flow)
- "old password" → "new password" → "new password again" (change flow)
- "saved. lock with esc" (after successful save, with bold sweep animation)

Code location: `src/features/auth/components/PasswordSettings.tsx`

```tsx
const isBgGreen = bgHue >= 80 && bgHue <= 160;
const confirmColor = isBgGreen ? '#0ffffb' : '#00ff00';
```

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

The app has 13 discoverable easter eggs + 1 secret final egg. The count displays in powerstat mode.

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
| 12 | `selectColorText` | Click on the color stats area (HSL/HEX values) |
| 13 | `resetBlackout` | See the blackout screen on reset confirmation |
| SECRET | `clickedEggCounter` | Click on "12.5/13" to complete (see below) |

### The 12.5/13 Gag

When the user finds all 13 regular eggs, the counter shows **"12.5/13 easter eggs"** instead of "13/13". The final egg is clicking on this incomplete counter:

1. User finds all 13 regular eggs → shows "12.5/13"
2. User clicks "12.5/13" → marks secret egg + rainbow animation + bold sweep animation
3. Counter now shows "13/13"

**The gag**: The 13th egg IS clicking on the counter. You can't complete the collection without clicking it.

After completing, clicking "13/13" replays both animations. Click anywhere or press any key to stop.

### Easter Egg Click Animation

When clicking "13/13 easter eggs", two animations play simultaneously:

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
| `src/features/statistics/components/StatsDisplay.tsx` | Display logic, 12.5 gag, rainbow animation |

### Implementation Notes

- `getEasterEggCount()` returns `total: 13` (hides the secret 14th egg)
- `isEasterEggFound('clickedEggCounter')` checks if secret is found
- Display shows "12.5" when `found === total && !hasSecretEgg`
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

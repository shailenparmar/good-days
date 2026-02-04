# Claude Code Instructions

## Push Checklist (MANDATORY)

**EVERY push requires ALL of these steps. No exceptions.**

1. **Increment version** in `src/App.tsx`
2. **Update CLAUDE.md** with any changes to:
   - UI behavior or styling
   - Keyboard shortcuts or interactions
   - State management patterns
   - Any logic that future development should know about
3. **Commit both** code AND documentation together
4. **Push to main**
5. **Tell the user**: "Pushed **vX.Y.Z** - documented [what was documented]"

**If you push without documenting, you have failed.** The user should never have to remind you.

## Deployment

Both apps deploy automatically on push to `main`:

- **GitHub Pages**: https://gdays.day (production)
- **Vercel**: https://gdays.vercel.app/ (backup)

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

## Storage Architecture

Journal entries are stored in **IndexedDB** (with localStorage fallback).

### Multi-Tab Safety (v1.9.10+)

The app is safe to use with multiple tabs open. Each save operation only writes the single entry being edited, not the entire entry list.

**Key functions** in `src/shared/storage/journalStorage.ts`:

| Function | What it does | When used |
|----------|--------------|-----------|
| `saveSingleEntry(entry)` | Writes one entry by date | User types, saves title |
| `deleteSingleEntry(date)` | Deletes one entry by date | Entry cleared (not today) |
| `saveAllJournalEntries(entries)` | Upserts multiple entries | Import only |

**Why this matters:**

Before v1.9.10, every save did `clear()` then `put()` for all entries. If Tab A was stale (opened days ago), saving from Tab A would delete entries Tab A didn't know about.

Now, Tab A can only affect the entry it's editing. Other entries are untouched.

### Multi-Tab Sync via BroadcastChannel (v1.10.0+)

Tabs communicate via `BroadcastChannel('good-days-sync')` to prevent silent overwrites when the same date is edited in multiple tabs.

**How it works:**
1. Each tab has a unique `TAB_ID` (random string, generated on load)
2. After every successful IndexedDB write, the tab broadcasts `{ type: 'entry-saved', date, tabId }`
3. Other tabs receive the message (own-tab messages filtered by `tabId`)
4. If a tab is viewing the saved date, it reloads that entry from IndexedDB and updates React state

**Key functions in `journalStorage.ts`:**

| Function | Purpose |
|----------|---------|
| `broadcastSave(date)` | Internal — broadcasts after successful write |
| `onEntrySaved(callback)` | Subscribe to saves from other tabs, returns unsubscribe fn |
| `loadSingleEntry(date)` | Read one entry from IndexedDB (used for reload) |

**In `useJournalEntries.ts`:**
- On mount, subscribes via `onEntrySaved`
- When another tab saves a date we're viewing, reloads entry and updates `currentContent`
- Logs to console: `[gdays] multi-tab: other tab saved 2026-02-03, reloading`

**Important:** BroadcastChannel is fully local (same-origin, same-device, same-browser). No network traffic. Falls back gracefully if unsupported (older Safari) — tabs just won't sync but nothing breaks.

### Write Debouncing (v1.10.0+)

Every keystroke updates `entriesRef` in memory immediately, but IndexedDB writes are debounced by **300ms**. This batches rapid typing into one write instead of one per character.

**Key functions in `journalStorage.ts`:**

| Function | Purpose |
|----------|---------|
| `saveSingleEntry(entry)` | Queues a debounced write (300ms) |
| `flushPendingSaves()` | Forces all pending writes immediately |

**`flushPendingSaves()` is called in three places:**
1. `beforeunload` handler — ensures pending writes start before tab closes
2. Midnight transition — ensures today's entry is written before switching to new day
3. Error boundary `componentDidCatch` — emergency save on React crash

### Persistent Storage Request (v1.10.0+)

On init, the app calls `navigator.storage.persist()` to request the browser protect data from eviction under storage pressure. Non-blocking, fire-and-forget.

- **Chrome/Firefox/Android**: May grant persistent storage
- **Safari**: Ignores this (7-day inactivity policy is not overridable by any API)

### Midnight Transition Safety (v1.10.0+)

At midnight, before clearing the editor and switching to the new day:
1. `saveEntry()` is called (updates `entriesRef` immediately, queues debounced write)
2. `flushPendingSaves()` forces the IndexedDB write to start immediately
3. Sync `localStorage.setItem` backup of all entries (guaranteed to complete before next line)
4. Only then does the editor clear and date switch

This ensures the previous day's entry is persisted even if IndexedDB is slow or the tab closes right at midnight.

Code location: `src/App.tsx` (midnight timeout handler)

### Error Boundary Emergency Save (v1.10.0+)

If React crashes during render, `ErrorBoundary.componentDidCatch` calls `flushPendingSaves()` to force any pending debounced writes to IndexedDB before showing the error screen.

Code location: `src/shared/components/ErrorBoundary.tsx`

### Debugging Storage Issues

All storage operations are logged to the console with `[gdays]` prefix:

```
[gdays 2026-02-03T...] initJournalStorage: loaded from IndexedDB { entryCount: 50, dates: [...] }
[gdays 2026-02-03T...] saveSingleEntry: saving { date: "2026-02-03", contentLength: 142 }
[gdays 2026-02-03T...] saveSingleEntry: saved to IndexedDB { date: "2026-02-03" }
```

To debug a user's storage issue:
1. Have them open DevTools Console
2. Refresh the page (logs `initJournalStorage` with entry count and dates)
3. Check if expected entries are listed

### beforeunload Backup

On tab close, entries are written to localStorage as a backup (IndexedDB writes are async and may not complete). On next load, localStorage backup is merged with IndexedDB, preferring newer `lastModified` timestamps.

The `beforeunload` handler is wrapped in try-catch to handle `QuotaExceededError` if localStorage is full. If it fails, the flush to IndexedDB is still the primary safety net.

## Backup & Import

The app supports exporting entries to an **encrypted** `.txt` file and importing them back.

### Backup Format

Backups are encrypted using AES-GCM with an app-embedded key.

**Filename**: `good days backup 02-03-2026 211201.txt` (MM-DD-YYYY HHmmss, zero-padded, always military time, no colon separators because macOS converts them to underscores)

**File contents**: Just the encrypted base64 blob, no header.
```
U2FsdGVkX1+vupppZksvRf8Z7J9K3xH5mN2qW...
[base64 encrypted content]
```

**Decrypted content** (JSON format, v1+):
```json
{
  "version": 1,
  "exportedAt": 1706969445000,
  "entries": [
    {
      "date": "2025-01-27",
      "content": "<div>Entry content here...</div>",
      "title": "Optional title",
      "startedAt": 1706345400000,
      "lastModified": 1706345400000
    }
  ]
}
```

**JSON format advantages:**
- Preserves all entry fields (`title`, `lastModified` were lost in legacy format)
- No regex parsing edge cases
- Version field for future format changes

**Legacy markdown format** (still supported for import):
```
# good days

---

## Monday, January 27, 2025

*Started at 09:30:00*

Entry content here...
```

Import automatically detects format: tries JSON first, falls back to legacy markdown.

### Import Validation

Validation is robust and backward-compatible:

1. **Find base64 content** - Find first line that looks like base64 (50+ chars of `[A-Za-z0-9+/=]`), skipping any header lines from old backups
2. **Decryption validates** - AES-GCM decryption fails on non-backup files (wrong key = error)
3. **JSON structure check** - Valid backup has `version` number and `entries` array
4. **Legacy fallback** - If not JSON, try markdown parser

New backups have no header (just encrypted content). Old backups with headers still import fine.

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

### Import `lastModified` Preservation (v1.10.0+)

Imported entries preserve their original `lastModified` timestamp from the backup file. This is important because:
- `lastModified` is meaningful journal metadata (when the entry was actually last edited)
- The merge logic uses `lastModified` to pick winners — fake timestamps would poison it
- Previously, all imported entries got `lastModified: Date.now()`, making old backups appear "newer" than current entries

**Current behavior:**

| Scenario | `lastModified` value |
|----------|---------------------|
| New entry from JSON backup (has `lastModified`) | Original from backup |
| New entry from JSON backup (no `lastModified`) | Import timestamp (fallback) |
| New entry from legacy markdown backup | Import timestamp (format has no `lastModified`) |
| Conflict merge (content appended) | Import timestamp (content genuinely changed) |

Code location: `src/features/export/utils/parseBackup.ts`

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
| Normal | Backup | "download backup" | — |
| Normal | Import | "import backup" | — |
| Powerstat | Copy | "copy markdown format" | — |
| Powerstat | Backup | "download AES-256-GCM backup" | — |
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
| Success | "X entry/entries imported" | Confirm color (WCAG green) |
| Failure | "import failed" | Error color (WCAG red) |

**Behaviors:**
- No hover shading when feedback is showing
- Dismiss by: **keystroke only** (clicks are intentional actions, not dismissals)
- Uses capture phase event listener to fire before `stopPropagation()` calls

**Status colors:** Uses WCAG-based dynamic colors for guaranteed readability. See **Dynamic Status Colors** section below for full algorithm details.

```typescript
const { confirm: confirmColor, error: errorColor } = getStatusColors(
  hue, saturation, lightness,       // text color HSL
  bgHue, bgSaturation, bgLightness  // background color HSL
);
```

**Count reflects actual changes:**
- Importing same backup twice → "0 entries imported" (nothing changed)
- New entries + modified entries are counted
- Skipped (identical content) entries are not counted
- Multi-file import shows combined total across all files

**Failure triggers:**
- File doesn't start with `good days encrypted backup` header
- Decryption fails (corrupted or wrong format)

Code location: `src/features/export/components/ExportButtons.tsx`

### Export Buttons Layout

All three export buttons (copy, download backup, import) live in a single `<div className="space-y-2">` container inside ExportButtons. The parent section in SettingsPanel wraps them in `<div className="p-4">` with a 6px bottom border in stacked mode. **Do NOT wrap individual buttons in their own bordered divs** — this creates unwanted thick panel lines between buttons.

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

## Midnight Detection

The app automatically switches to a new day at midnight, saving the current entry and creating a fresh one.

### Implementation

Uses refs to avoid stale closures and a single timeout chain:

```tsx
// App.tsx
const journalRef = useRef(journal);
useEffect(() => { journalRef.current = journal; }, [journal]);
const midnightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  const scheduleNextMidnight = () => {
    const msUntilMidnight = /* calculate */;
    midnightTimeoutRef.current = setTimeout(() => {
      journalRef.current.saveEntry(content, Date.now());
      journalRef.current.setSelectedDate(getTodayDate());
      scheduleNextMidnight(); // Reschedule for next midnight
    }, msUntilMidnight);
  };
  scheduleNextMidnight();
  return () => {
    if (midnightTimeoutRef.current) clearTimeout(midnightTimeoutRef.current);
  };
}, []); // Empty deps - uses refs for latest values
```

**Why refs:** The `journal` object changes on every entry update. Without refs, the effect would re-run constantly, creating multiple timer chains that all fire at midnight (race condition).

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
| Deactivated | "scramble hotkey deactivated" | (no change) |
| Activated | "scramble hotkey activated" | "option/alt + s" |

When activated, Option/Alt+S toggles scramble from anywhere in the app.

**Hover Flicker Fix:** Uses the `useStableHover` hook (see "The Hover Flicker Problem"). On hover, the bounding rect is captured. If the button shrinks and triggers mouseLeave while the cursor is still in the original rect, we stay hovered. No overlay div, no scroll blocking.

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
| Export debug log button | Downloads human-readable action log for debugging |
| Reset app button | Appears at bottom of Settings panel (with RotateCcw icon) |
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

| Panel | Width | Notes |
|-------|-------|-------|
| Sidebar | 320px (`w-80`) | Includes 6px right border |
| Settings | 320px (`w-80`) | Includes 6px right border |
| About (alone) | 720px | Includes 6px right border |
| About (stacked) | 400px | Includes 6px right border |

### Right Edge Alignment (IMPORTANT)

The About panel's right edge stays at the **same horizontal position** whether in About-only mode or powerstat mode.

#### The Math

Tailwind uses `box-sizing: border-box` globally, meaning **borders are inside the width**, not added to it.

```
About-only mode:
  Sidebar (320px) + About (720px) = 1040px right edge

Powerstat mode:
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

**Copy**: Copies both colors to clipboard in hex format:
```
txt: #78cc33
bg: #c8ff00
```

**Paste**: Reads clipboard, parses color values, applies them, creates new preset.

Code location: `src/features/statistics/components/StatsDisplay.tsx`

## Desktop Color Picker

The saturation/lightness picker in settings uses mouse drag with global event listeners.

### Drag Listener Cleanup

When the user mousedowns on the sat/light square, `mousemove` and `mouseup` listeners are added to `document`. The `mouseup` handler removes both listeners. Active listeners are tracked in a ref (`listenersRef`) so they can be cleaned up on component unmount - this prevents a memory leak if the component is removed mid-drag (e.g. closing settings while dragging).

Code location: `src/features/theme/components/ColorPicker.tsx`

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
│        │   ●    │              │  ← square centered between
│        └────────┘              │     title and buttons
│                                │
│   ┌────────────────────────┐   │
│   │   recalibrate tilt     │   │  ← Full-width button
│   └────────────────────────┘   │
│   ┌───────────┬────────────┐   │
│   │   copy    │   paste    │   │  ← Split button
│   └───────────┴────────────┘   │
│   ┌───────────┬────────────┐   │
│   │   text    │ background │   │  ← Split button (triggers picker)
│   └───────────┴────────────┘   │
└────────────────────────────────┘
```

**Picker Screen** (while holding background or text):
```
┌────────────────────────────────┐
│          good days             │  ← title, same position as home
│            white               │
│   gray ┌────────┐ vivid       │  ← square centered, labels at
│        │   ●    │             │     edge midpoints (no +, no stats)
│        └────────┘              │
│            black               │
│       #78cc33    #c8ff00        │  ← Hex codes (monospace, bold)
├───────────────┬────────────────┤
│     text      │   background   │  ← Labels (black)
│ ──────────────│────────────────│  ← Horizontal hue indicators
│               │                │
│  (hue gradient│  hue gradient) │  ← Split hue bars
│               │                │
└───────────────┴────────────────┘
```

### Layout Centering

The tilt square complex (square + sat/light labels) is vertically centered in the space between the title and the bottom element using `flex: 1` with `alignItems: 'center'`. This keeps the square in the same visual position on both screens regardless of bottom element height.

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

### Tilt Controls (Absolute Mapping)

Tilt values use **absolute mapping** from the phone's orientation when picking started:

| Tilt | Controls | Mapping |
|------|----------|---------|
| Left/Right (gamma) | Saturation | Left = 0%, Flat = 50%, Right = 100% |
| Forward/Back (beta) | Lightness | Forward = 5%, Flat = 50%, Back = 95% |

**Max tilt angle**: ±10° to reach extremes (20° total range)

The sat/light square shows:
- Dot position indicates current tilt
- Edge midpoint labels (picker only): white (top), black (bottom), gray (left), vivid (right)
- Labels are centered ON the edge lines (straddling them), 16px monospace bold
- No sat/light number stats (removed in v1.10.7)
- The + crosshair only shows on the home screen, not in the picker

### Button Styling

All mobile buttons (including the permission screen "calibrate tilt" button) use the shared `getButtonStyle()` helper:
- **Default**: 60% opacity border, transparent fill
- **Pressed**: 100% opacity border, 65% lightness, 20% opacity fill
- **Padding**: `14px 0` (vertical), flexbox centered
- **Font**: monospace, weight 800, 20px
- **Border**: 4px solid (2px on split interior edges), 12px radius

### iOS Permission

iOS 13+ requires explicit permission for DeviceOrientationEvent:
1. Permission screen shown on first visit
2. User taps "calibrate tilt" button
3. `DeviceOrientationEvent.requestPermission()` called
4. If granted, home screen shown
5. If denied, tilt controls won't work (hue-only mode)

### Copy/Paste

| Button | Action |
|--------|--------|
| `copy` | Copies `txt: #hex\nbg: #hex` to clipboard |
| `paste` | Parses clipboard, applies colors |

**iOS copy method:** Uses textarea + `document.execCommand('copy')` instead of `navigator.clipboard.writeText()`. The Clipboard API on iOS Safari URL-encodes text when pasting into iMessage and other apps (`%20` for spaces, `%25` for `%`, etc.). The textarea approach writes pure plain text. Falls back to Clipboard API if execCommand fails.

**Paste decoding:** Both mobile and desktop paste handlers run `decodeURIComponent()` on clipboard text before parsing, as a safety net for URL-encoded input.

**Supported paste formats:**
- `txt: #rrggbb` - text color HEX (primary format, matches copy output)
- `bg: #rrggbb` - background color HEX (primary format, matches copy output)
- `txt: h, s%, l%` - text color HSL (legacy)
- `bg: h, s%, l%` - background color HSL (legacy)
- `h, s%, l%` - plain HSL (applies to text)
- `#rrggbb` - bare HEX (applies to text)

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

Note: The iOS "Paste" callout when reading clipboard via `navigator.clipboard.readText()` is a system requirement and cannot be suppressed or dismissed by tapping outside.

### Hue Indicator Clamping

The horizontal hue indicators use `clamp()` to stay within bar bounds:
```css
top: clamp(0px, calc(X% - 2px), calc(100% - 4px))
```
This prevents the 4px indicator from overflowing above the bar at hue 0 or below at hue 360.

### Title Version Display

Tap and hold the "good days" title on any screen to show the version number (e.g., "v1.10.7"). Title text replaces entirely with the version — no "good days" prefix. Releases back to "good days" on touch end. Works on all three screens (permission, home, picker).

**IMPORTANT:** `mobileVersion` in `src/main.tsx` must be bumped alongside `VERSION` in `src/shared/version.ts` on every push.

### Haptic Feedback

| Event | Pattern |
|-------|---------|
| Touch start (begin picking) | 10ms vibration |
| Touch end (lock color) | 5ms, 30ms pause, 5ms |
| Button tap | 10ms vibration |

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
| `showDebugMenu` | Settings panel open | Yes | `false` |
| `showAboutPanel` | About panel open | Yes | `false` |
| `preFocusState` | Saved state before entering zen/minizen (for restore) | No | `null` |
| `preNarrowState` | Saved state before narrowing (for restore on widen) | No | `null` |
| `zenFromMinizen` | Tracks if zen was entered from minizen (for proper exit) | No | `false` |

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

See `src/App.tsx` for full implementation including ESC handler and resize logic.

### Key Principles

1. **Focus modes are fully reversible** - Exiting any focus mode restores the exact prior state, including open panels
2. **Footer = zen toggle** - Footer click enters/exits zen in both modes
3. **Header = sidebar toggle** - Header click toggles sidebar visibility (minizen in wide, overlay in narrow)
4. **Zen survives resize** - If in zen, stay in zen across breakpoint
5. **`preFocusState` captures full context** - See "State Lifecycle" section above for details

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
2. **Zen mode** → Exit zen, restore previous state (works even when typing in editor!)
3. **User in password input** → Do nothing (only `<input>`, NOT `<textarea>`)
4. **Minizen mode (wide)** → Exit minizen, restore previous state (including panels)
5. **Function menus open** → Close all panels (both at once)
6. **Narrow + sidebar hidden** → Show sidebar
7. **Base state** → Lock app (sidebar visible, no menus open)

**IMPORTANT:** Zen mode check comes BEFORE the input check. This ensures ESC exits zen even when the user is focused in the editor textarea.

### The ESC Philosophy

**ESC = "Go back to what you were looking at"**

Each ESC press peels back one layer of UI state. You can only lock from the "base state" (sidebar visible, no function menus open). This ensures:
- No accidental locks from deep states
- Each ESC is predictable and reversible
- You always see the lock coming

**Example flow:**
```
Wide + powerstat → ESC → Wide + full (panels closed)
                → ESC → 🔒 LOCKED

Wide + settings → zen → ESC → Wide + settings (restored!)
                      → ESC → Wide + full
                      → ESC → 🔒 LOCKED
```

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
3. **In zen mode** - Exit zen instead
4. **In minizen mode** - Exit minizen instead
5. **Function menus open** - Close panels instead
6. **Narrow + sidebar hidden** - Show sidebar instead
7. **User in password input** - Only blocks `<input>` elements, NOT the editor `<textarea>`

### When ESC SHOULD Lock

**Only from base state:** sidebar visible, no function menus open, not in focus mode.

1. **Wide + full view** - Sidebar visible, no panels, not in minizen/zen
2. **Narrow + sidebar visible** - No panels open
3. **After password saved** - Label says "esc to lock", `isSaving=true`

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
| "set password" (set) | `true` | `false` | Clear input, keep focus (if focused/has content), else pass through to lock |
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
| `og-image.png` | Social sharing (iMessage, etc.) | Icon on white background, generated from `og-source.svg` |
| `og-source.svg` | Source SVG for og-image.png | 1200x630, icon centered on white bg |

**og:image URL:** Must be an **absolute URL** (`https://gdays.day/og-image.png`) in `index.html`, not a relative path. Social crawlers (iMessage, Twitter, etc.) require absolute URLs to fetch the preview image.

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

The version number is stored in `src/shared/version.ts` as `export const VERSION = 'x.y.z'` (imported by both `App.tsx` and `main.tsx`).

When pushing changes:
1. **ALWAYS increment the version number** in `src/shared/version.ts` AND `mobileVersion` in `src/main.tsx` before pushing
   - Patch (x.y.Z): Bug fixes, small tweaks, any change at all
   - Minor (x.Y.0): New features, non-breaking changes
   - Major (X.0.0): Breaking changes, major rewrites
2. **Tell the user the version number** after pushing (e.g., "Pushed **v1.0.1**")
3. Use the version in the commit message (e.g., "v1.0.1: Fix editor focus issue")

The version displays by hovering over the "good days" title in the sidebar header (the rectangle between the two 6px panel lines). On hover, the title changes to `good days v1.10.6`. On mouse leave, it reverts to `good days`. Works in both normal and superscramble modes.

**Implementation:** Uses coordinate-based hover detection (`mousemove` + `getBoundingClientRect`) via a ref on the title div. This bypasses the z-50 overlay that sits on top for minizen click handling — hover and click are fully independent. No `onMouseEnter`/`onMouseLeave` (those would be blocked by the overlay).

This lets the user verify which build is deployed by hovering the title and checking the version.

## Action Logger

Lightweight debug logger for diagnosing user-reported issues. Stores a circular buffer of up to 500 events in localStorage (key: `gdays_actionLog`). **Never logs entry content** — only event names and metadata (counts, dates, flags).

**Code location**: `src/shared/logger.ts`

**Events logged**: storage init/save/delete/flush, journal load/date changes/deletions, multi-tab reloads, beforeunload flushes, fallback mode transitions, auth lock/unlock/password, export/import, errors, app load/midnight.

**API**:
- `logAction(event, data?)` — append event to circular buffer
- `exportLogs(appVersion, entryCount)` — human-readable dump with header
- `clearLogs()` — wipe all logs

**Export UI**: "export debug log" button in powerstat mode (Settings panel, same section as reset). Downloads a `.txt` file with app version, entry count, user agent, and timestamped events. Filename: `good days debug log MM-DD-YYYY HHmmss.txt`.

## Storage Architecture

**Migration v1.7.0**: Journal entries moved from localStorage (5MB limit) to IndexedDB (effectively unlimited). Existing users migrate seamlessly on first load.

### Files Changed in Migration

| File | Change |
|------|--------|
| `src/shared/storage/journalStorage.ts` | **NEW** - IndexedDB wrapper module |
| `src/features/journal/hooks/useJournalEntries.ts` | Async loading, uses IndexedDB |
| `src/features/statistics/components/StatsDisplay.tsx` | Storage display via Storage API |
| `src/features/settings/components/AboutPanel.tsx` | Safari 7-day warning copy |
| `src/App.tsx` | Loading screen, import uses IndexedDB |

### IndexedDB Schema

| Property | Value |
|----------|-------|
| Database name | `good-days` |
| Version | 1 |
| Object stores | `entries` (keyPath: `date`), `metadata` (keyPath: `key`) |

The `entries` store holds journal entries with `date` as the primary key (format: `YYYY-MM-DD`).

The `metadata` store tracks migration state with a `migrated` key.

**Code location**: `src/shared/storage/journalStorage.ts`

### Loading State

The app shows a brief "loading..." screen while IndexedDB initializes:

```tsx
// App.tsx
if (journal.isLoading) {
  return (
    <div className="flex h-screen items-center justify-center" style={{ backgroundColor }}>
      <span className="text-base font-mono font-bold" style={{ color }}>loading...</span>
    </div>
  );
}
```

The `useJournalEntries` hook exposes `isLoading` which is `true` until `initJournalStorage()` completes.

### Migration Flow

```
App starts
    ↓
Open IndexedDB 'good-days'
    ↓
Check metadata store for 'migrated' flag
    ↓
┌─────────────────────────────────────────────────────────────┐
│ localStorage has 'journalEntries'?                          │
├─────────────────────────────────────────────────────────────┤
│ YES + not migrated:                                         │
│   1. Parse localStorage entries                             │
│   2. Write all to IndexedDB entries store                   │
│   3. Read back from IndexedDB                               │
│   4. Verify count matches (CRITICAL - don't delete if not!) │
│   5. Set 'migrated' flag in metadata store                  │
│   6. Delete 'journalEntries' from localStorage              │
│   7. Return entries                                         │
├─────────────────────────────────────────────────────────────┤
│ YES + already migrated:                                     │
│   → Merge localStorage backup with IndexedDB (see below)    │
├─────────────────────────────────────────────────────────────┤
│ NO:                                                         │
│   → Load directly from IndexedDB                            │
└─────────────────────────────────────────────────────────────┘
```

**Safety guarantee**: localStorage is ONLY deleted after IndexedDB write is verified by reading back and comparing entry count.

### Merge Logic (beforeunload Backup)

**Problem**: `saveAllJournalEntries()` is fire-and-forget async. If user closes tab quickly, the IndexedDB write may not complete.

**Solution**: The `beforeunload` event writes entries to localStorage as a synchronous backup:

```tsx
// useJournalEntries.ts
const handleBeforeUnload = () => {
  if (entriesRef.current.length > 0) {
    localStorage.setItem('journalEntries', JSON.stringify(entriesRef.current));
  }
};
```

On next load, if localStorage has data AND migration already happened, we merge:

```tsx
// journalStorage.ts - mergeEntries()
function mergeEntries(indexedDBEntries, localStorageEntries) {
  // For each entry, keep the one with newer lastModified timestamp
  // localStorage entries take precedence if timestamps are equal
  // (they're from beforeunload, potentially more recent)
}
```

**Merge steps**:
1. Create map of IndexedDB entries by date
2. For each localStorage entry:
   - If date not in IndexedDB → add it
   - If date exists → compare `lastModified`, keep newer
3. Write merged result to IndexedDB
4. Clear localStorage

### Fallback Mode

If IndexedDB fails (private browsing, Safari quirks, quota exceeded):

```tsx
try {
  const db = await openDatabase();
  // ... use IndexedDB
} catch (error) {
  console.error('IndexedDB failed, falling back to localStorage:', error);
  fallbackMode = true;
  return parseLocalStorageEntries();
}
```

- `isInFallbackMode()` returns `true` when in fallback
- All operations work identically, just using localStorage
- Users won't notice except the 5MB limit applies
- Fallback is sticky for the session (doesn't retry IndexedDB)

### Error Handling

| Error | Behavior |
|-------|----------|
| IndexedDB unavailable | Fall back to localStorage |
| Migration verification fails | Throw error → fall back to localStorage (localStorage NOT deleted) |
| Write fails mid-session | Fall back to localStorage, log error |
| Merge fails | Log error, continue with IndexedDB data (localStorage backup preserved) |

### Browser-Specific Behavior

**Safari/iOS (Intelligent Tracking Prevention)**:
- Deletes ALL browser storage after 7 days of inactivity
- Applies to localStorage AND IndexedDB
- This is documented in the About panel

**About panel copy**:
> "however, if you manually clear site data in browser settings, you'll lose your content. notably, Safari is the only major browser with inactivity deletion (7 days). other browsers will only delete data under disk space storage pressure."

**Chrome/Firefox/Edge**:
- Only delete data under storage pressure (low disk space)
- No time-based deletion
- Effectively permanent storage

### What Stays in localStorage

Small settings that benefit from synchronous access:

| Category | Keys |
|----------|------|
| Theme | `colorHue`, `bgHue`, `saturation`, `lightness`, `bgSaturation`, `bgLightness` |
| UI state | `showSettings`, `showAbout`, `zenMode`, `minizen`, `isScrambled`, `scrambleHotkeyActive` |
| Auth | `passwordHash` |
| Statistics | `totalKeystrokes`, `totalSecondsOnApp`, `totalLogins` |
| Easter eggs | `easterEggs` |
| Scroll positions | `settingsScrollTop`, `aboutScrollTop`, `scrollPosition:*` |
| Presets | `customPresets`, `selectedPreset`, `selectedCustomPreset` |
| Other | `selectedDate`, `lastTypedTime` |

### Import/Export Behavior

**Export**: Reads from current entries state (backed by IndexedDB).

**Import**:
```tsx
// App.tsx
onImport={(entries) => {
  journal.setEntries(entries);
  saveAllJournalEntries(entries);  // Writes to IndexedDB
  setEditorKey(k => k + 1);
}}
```

Import writes directly to IndexedDB via `saveAllJournalEntries()`.

### Reset App Behavior

The reset button (powerstat mode) clears both storage systems. The process handles two key issues:

1. **Async IndexedDB deletion** - Must wait for `deleteDatabase()` to complete before reload
2. **beforeunload race condition** - App's backup-on-close would re-save entries to localStorage

```tsx
// SettingsPanel.tsx
(window as { __resettingApp?: boolean }).__resettingApp = true;  // Prevent beforeunload save
localStorage.clear();
const deleteRequest = indexedDB.deleteDatabase('good-days');
deleteRequest.onsuccess = () => location.reload();  // Wait for deletion
deleteRequest.onerror = () => location.reload();
deleteRequest.onblocked = () => location.reload();
```

The `__resettingApp` flag is checked in `useJournalEntries.ts`:

```tsx
// beforeunload handler
if ((window as { __resettingApp?: boolean }).__resettingApp) return;  // Skip save during reset
```

**Why this matters:** Without the flag, the beforeunload handler would save entries to localStorage immediately before reload, then `initJournalStorage()` would find them and migrate them back to IndexedDB on the fresh load.

### Storage Display (Powerstat Mode)

Shows IndexedDB quota via `navigator.storage.estimate()`:

- Format: `{used} MB / {quota}` (e.g., "0.15 MB / 2.5 GB")
- Large quotas (≥1GB) shown in GB
- Fetched once when powerstat opens (not live-updating)
- Fallback: iterates localStorage if Storage API unavailable

```tsx
getStorageEstimate().then(({ used, quota }) => {
  const usedMB = (used / (1024 * 1024)).toFixed(2);
  const quotaGB = (quota / (1024 * 1024 * 1024)).toFixed(1);
  // Display: "0.15 MB / 2.5 GB"
});
```

### Functions Reference

| Function | Purpose |
|----------|---------|
| `initJournalStorage()` | Opens DB, migrates if needed, merges backup, returns entries |
| `saveAllJournalEntries(entries)` | Bulk upsert (fire-and-forget async, falls back on error) |
| `saveSingleEntry(entry)` | Save one entry (multi-tab safe, no clear) |
| `deleteSingleEntry(date)` | Delete one entry by date |
| `getStorageEstimate()` | Returns `{ used, quota }` in bytes via Storage API |
| `isInFallbackMode()` | True if using localStorage instead of IndexedDB |
| `clearJournalStorage()` | Clears entries and metadata stores (for reset) |

### Debugging

**Check if migration happened**:
1. Open DevTools → Application → IndexedDB → `good-days`
2. Check `metadata` store for `{ key: 'migrated', value: true }`
3. Check `entries` store has your entries

**Check localStorage cleared**:
1. Open DevTools → Application → Local Storage
2. `journalEntries` key should NOT exist after successful migration

**Force re-migration** (for testing):
1. Clear IndexedDB: `indexedDB.deleteDatabase('good-days')`
2. Reload - will migrate from localStorage again (if localStorage has data)

**Console messages**:
- `Migrating X entries from localStorage to IndexedDB...` - migration starting
- `Migration complete, localStorage cleared` - success
- `IndexedDB failed, falling back to localStorage:` - fallback triggered
- `Merging localStorage backup with IndexedDB...` - merge happening

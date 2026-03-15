# Claude Code Instructions — Journal

## Entry Titles (v2.3.33+)

Entries can be named with an optional title. The `title` field on `JournalEntry` existed since the type was defined; this version adds the UI.

### How it works

**Header** (`EntryHeader.tsx`):
- Click the date text (e.g. "feb 8, 2026") to enter title editing mode
- An inline input replaces the date — sized to content width using `ch` units (monospace), not full-width. Clicking empty space to the right of the text blurs/saves the title. Parent div has `min-w-0` to prevent flex blowout; input has `maxWidth: 100%` to cap at container. Minimum width = placeholder length when empty, text length + 1 when has content.
- Placeholder: "set title" with the standard bold/unbold sweep animation (83ms per char)
- Enter, Tab, Escape, or blur saves. Enter and Tab move focus to the editor textarea with cursor at end (via `requestAnimationFrame` + `editorRef`).
- **Scramble overlay (v2.3.39+, updated v2.4.0):** When scramble or superscramble is active, the title input text is transparent and an absolute-positioned overlay shows the scrambled title text. Same pattern as the editor scramble overlay. The overlay clips at the edge without ellipsis. **Scroll sync (v2.4.0):** The overlay tracks the input's `scrollLeft` via a `useEffect` (rAF after `titleInput` changes) + `onSelect` handler. An inner `<span>` with `translateX(-scrollLeft)` shifts the scrambled text to match the input's scroll position. Works pixel-perfectly because font-mono + same-length scrambled text.
- **Hotkey passthrough (v2.4.2+, updated v2.4.18):** `onKeyDown` only calls `stopPropagation()` for Enter, Tab, and Escape — all other keys bubble freely to window-level listeners. This lets Alt+S scramble toggle work while the title input is focused (previously it inserted `ß` because the blanket `stopPropagation` prevented the window handler from calling `preventDefault`). **Escape + scramble (v2.4.18):** When scrambled, Escape in the title input does NOT call `stopPropagation()` — it saves the title but lets the event bubble to the App handler, which unscrambles.
- No character limit — type freely, long titles truncate with ellipsis when not editing
- Once titled, the header shows the title instead of the date (no "date: title" format — just the title)
- `onEditingChange` callback notifies `App.tsx` → sets `titleEditing` state → passes `hidePlaceholder` to `JournalEditor` so the editor's "start typing" placeholder hides while the title input has focus

**Sidebar** (`EntrySidebar.tsx`):
- Titled entries show the title as primary text (not the date)
- Untitled entries show the date normally
- Title editing is header-only — sidebar is display-only
- **Scramble support (v2.3.35+):** Titles (user content) are scrambled in regular scramble mode. Dates are NOT scrambled (structural, not content). In superscramble, everything scrambles as before.
- **Scramble re-randomize (v2.3.38+, fixed v2.4.18, unified v2.4.23):** Every toggle-on produces a fresh scramble (`bumpScrambleSeed(Date.now())`). Typing while scrambled re-randomizes all scrambled text (editor, sidebar titles, header title) on every keystroke. `bumpScrambleSeed()` in `App.tsx` sets both the module-level `globalScrambleSeed` and React state synchronously — avoids the stale-global-during-render bug that an effect-only sync had. **Title input (v2.4.18+):** `onTitleInput` callback prop on `EntryHeader` fires on every title keystroke → App.tsx calls `bumpScrambleSeed()` (scramble) and `randomizeTheme()` (superscramble), matching the editor's `handleInput` behavior. **Editor seed-aware (v2.4.23+):** `JournalEditor` receives `scrambleSeed` as a prop, added to the `useMemo` dependency array for `scrambledValue`. Previously the editor used `Math.random()` memoized on `value` only — it wouldn't re-scramble when the seed bumped (e.g., from title typing). Now all three scrambled areas (editor, sidebar, title) use the same seed system and re-scramble together.

**Storage**: Titles are encrypted as part of the `{ content, title }` payload in IndexedDB. `saveTitle()` in `useJournalEntries.ts` updates the entry, sets `lastModified`, and persists via `saveSingleEntry()`.

**Eager ref update (v2.6.6+):** `saveTitle()` updates `entriesRef.current` eagerly (before `setEntries`), matching the pattern used by `saveEntry()`. Previously, the ref was updated inside the `setEntries` callback, creating a race where a debounced `saveEntry()` could read stale `entriesRef` without the title and overwrite it with `undefined` in IndexedDB.

**Blank entry guard (v2.7.20+):** `saveTitle()` returns early without persisting if both content and title are empty. This prevents the in-memory "ensure today" placeholder (which has no `startedAt`) from being written to IndexedDB when the user clicks the date header and blurs without typing a title. Also sets `startedAt` to `now` when missing on any title save — so a title-only entry (no body content) correctly records when the user titled it. A title alone is a valid entry; clearing the title on a day with no content removes the entry.

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
- Auto-focus on keypress (focus textarea on window keydown, switches to today if viewing past entry)
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
- Paste (v1.10.24+): Forces plain text via `getData('text/plain')` + `execCommand('insertText')`. Strips all rich formatting (fonts, images, centering, bold, etc.) so pasted content always matches the app's monospace style. Uses `execCommand` to preserve Cmd+Z undo.

### Backslash Commands (v2.4.53+)

Backslash commands are processed in `handleChange`. All commands loop to handle multiple instances in one paste. A shared `commandFired` flag gates a single `requestAnimationFrame` for scroll/cursor restore at the end.

| Command | Effect | Vanishes? |
|---------|--------|-----------|
| `\time` | Replaces with `[timestamp]` | No (replaced) |
| `\color` | Replaces with current theme colors (hex + HSL) | No (replaced) |
| `\t#RRGGBB` | Sets text color | Yes |
| `\txt#RRGGBB` | Sets text color | Yes |
| `\text#RRGGBB` | Sets text color | Yes |
| `\b#RRGGBB` | Sets background color | Yes |
| `\bg#RRGGBB` | Sets background color | Yes |
| `\background#RRGGBB` | Sets background color | Yes |
| `\#RRGGBB` | Sets background color (default) | Yes |

**Color command formats** (all case-insensitive, flexible whitespace/colon):
- `\t#hex`, `\txt#hex`, `\text#hex` (+ colon/space variants like `\t: #hex`) — text color from hex (converted via `hexToHsl`)
- `\t#hex hN sN lN`, `\txt#hex hN sN lN`, `\text#hex hN sN lN` (+ colon/space variants) — text color from HSL directly (more accurate)
- `\b#hex`, `\bg#hex`, `\background#hex` (+ colon/space variants) — same for background
- `\#hex` or `\#hex hN sN lN` — shorthand, defaults to background

The HSL format matches the app's copy/paste output (`txt: #hex hN sN lN`). When HSL values are present they're used directly (avoids hex round-trip precision loss). `trackCurrentColorway()` is called once after all color commands are processed.

**`hexToHsl` utility:** Local to `JournalEditor.tsx` (next to `scrambleChar`). Converts `#RRGGBB` → `{ h, s, l }`. Inverse of the `hslToHex` in `StatsDisplay.tsx`.

**`hslToHex` utility (v2.6.99+):** Also local to `JournalEditor.tsx`. Converts `(h, s, l)` → `#RRGGBB`. Used by `\color` command. Same implementation as `StatsDisplay.tsx`.

**`\color` command (v2.6.99+):** Replaces `\color` with the current theme colors in the format `txt: #hex hN sN lN\nbg: #hex hN sN lN`. Output is round-trippable — can be pasted back to restore colors via `\txt:` / `\bg:` commands.

### Scramble Mode

When `isScrambled` is true:
1. Textarea text color is transparent
2. Overlay div shows scrambled text
3. Scroll position synced via `translateY(-${scrollTop}px)`
4. Scrambled text is memoized (`useMemo`) on `[value, scrambleSeed]` — re-scrambles when content changes or seed bumps
5. **Scroll sync in handleChange (v2.5.11+):** `setScrollTop(editorRef.current.scrollTop)` is called inside `handleChange` alongside `setValue`, so both batch into the same React render. Without this, pressing Enter at the bottom of the editor causes the textarea to auto-scroll (browser native), but `onScroll` fires as a separate event — React could render the new scrambled text at the old scroll position for one frame, producing a visible flash.
6. **Rubber band suppressed (v2.6.64+, both axes v2.6.65+):** `overscrollBehavior: 'none'` on the textarea when scrambled. Native rubber banding causes the textarea to visually overscroll while `scrollTop` stays clamped — the overlay can't follow because there's no JS API for the rubber band offset. Suppressing it means scroll stops hard at the boundary, keeping overlay and textarea in perfect sync. Uses the shorthand `overscrollBehavior` (not just `Y`) to cover both vertical and horizontal axes. When not scrambled, the inline style is `undefined` so `.scrollbar-hide`'s `contain` takes over normally.
7. **Zero-lag overlay sync (v2.6.64+):** Scramble and cursor overlays have refs (`scrambleOverlayRef`, `cursorOverlayRef`). The `handleScroll` callback sets their `transform` directly on the DOM before the React state update — same frame as the native scroll event. React state (`scrollTop`) still updates for re-renders (seed bumps, content changes), but during scroll the direct DOM write eliminates the 1-frame lag that React's render cycle would introduce.

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
      caret-color: ${needsCustomCursor ? 'transparent' : getColor()};
    }
    @supports (caret-shape: block) {
      .journal-textarea {
        caret-color: ${getColor()};
        caret-shape: block;
      }
    }
  `}
</style>
```

### Browser Support

| Browser | Cursor Appearance |
|---------|-------------------|
| Chrome 144+ | Native block cursor (`caret-shape: block`) |
| Firefox | Native block cursor (`caret-shape: block`) |
| Safari | Custom block cursor via text overlay fallback (v2.1.35+) |

### Safari Block Cursor Fallback (v2.1.35+)

Safari doesn't support `caret-shape: block`. The fallback uses a text overlay approach:

1. `CSS.supports('caret-shape', 'block')` detects lack of support → `needsCustomCursor = true`
2. Native caret is hidden (`caret-color: transparent`), overridden back by `@supports` for Chrome/Firefox
3. A `pointer-events-none` overlay div renders the full text transparently, with a colored `backgroundColor` block at the cursor position
4. The overlay uses identical CSS classes (`p-8 text-base leading-relaxed font-mono font-bold whitespace-pre-wrap break-words`) so word wrapping matches the textarea exactly
5. `onSelect` tracks cursor position; `key={version}` restarts the blink animation on each movement (solid while typing, blinks after 1s idle)
6. Scroll sync via the same `scrollTop` state used by the scramble overlay (`translateY(-${scrollTop}px)`)
7. Hidden when: selection is not collapsed (text selected), or textarea is not focused

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
| No block cursor | Check `needsCustomCursor` — Safari uses text overlay fallback |
| Cursor blinks on delete | Expected behavior (tradeoff for working undo) |

### Key Files

| File | Purpose |
|------|---------|
| `src/features/journal/components/JournalEditor.tsx` | Textarea editor, scramble overlay, `\time` command |

## Midnight Detection

The app automatically switches to a new day at midnight, saving the current entry and creating a fresh one.

### Implementation

Uses refs to avoid stale closures and a single timeout chain:

Extracted into `src/hooks/useMidnightTimer.ts`. Takes `editorRef` and `journalRef` as parameters, uses refs to avoid stale closures.

**Why refs:** The `journal` object changes on every entry update. Without refs, the effect would re-run constantly, creating multiple timer chains that all fire at midnight (race condition).

**Visibility resume (v2.5.61+):** `setTimeout` doesn't fire while a tab is suspended (sleep, background, etc.). A `visibilitychange` listener checks if the date has changed when the tab becomes visible again. If `selectedDate !== getTodayDate()`, it runs the same save/flush/switch logic and reschedules the midnight timeout. Logged as `app.midnight.visibility`.

## Scramble Mode

Scramble mode obfuscates entry text to prevent over-the-shoulder reading.

### Behaviors

- **Persists across entries** - Scramble stays on when navigating between dates
- **Persists across refresh** - Stored in localStorage as `isScrambled`
- **Hotkey** - Option+S (Mac) / Alt+S (Windows) toggles scramble when hotkey is activated

### Scramble Hotkey

The scramble hotkey is a power user feature, only available in **poweruser mode** (settings + about panels both open).

| State | Button Text | On Hover |
|-------|-------------|----------|
| Deactivated | "scramble hotkey deactivated" | (no change) |
| Activated | "scramble hotkey activated" | "option/alt + s" |

When activated, Option/Alt+S toggles scramble from anywhere in the app. The hotkey listener always calls `preventDefault()` on Alt+S regardless of activation state (v2.1.32+) to prevent macOS from inserting "ß" into the editor.

**Hover Flicker Fix:** Uses the `hoverChildren` prop on `FunctionButton` (see "The Hover Flicker Problem"). On hover, the bounding rect is captured. If the button shrinks and triggers mouseLeave while the cursor is still in the original rect, we stay hovered. No wrapper div, no scroll blocking.

Code location: `src/App.tsx` (hotkey listener), `src/features/settings/components/SettingsPanel.tsx` (toggle button)

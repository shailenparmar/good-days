# Claude Code Instructions

## Electron Desktop App (Apple App Store Goal)

The app is being wrapped in **Electron** to ship on the Mac App Store. Same React codebase, but storage routes through file-based IPC instead of IndexedDB when running in Electron.

### Architecture

```
PWA (web):   React → IndexedDB (browser storage)
Electron:    React → IPC → file system (userData/entries/YYYY-MM-DD.json)
```

Detection: `window.electronAPI?.platform === 'electron'` — exposed by preload script via contextBridge.

### What's done

**Electron shell** (`electron/` directory):
- `main.ts` — BrowserWindow, context isolation, sandbox enabled, hiddenInset title bar
- `preload.ts` — contextBridge exposes `window.electronAPI` (storage + backup + platform)
- `storage.ts` — IPC handlers: save/load/loadAll/delete entries as JSON files in `userData/entries/`
- `backup.ts` — IPC handlers: native save/open dialogs for backup `.txt` files
- `types.ts` — IPC channel constants
- `tsconfig.json` — Electron-specific TypeScript config (CommonJS, ES2022)

**React ↔ Electron wiring** (the work done in this session):
- `src/shared/types/electron.d.ts` — Ambient type declaration for `window.electronAPI`
- `src/shared/storage/journalStorage.ts` — Every storage function has an `if (isElectron())` early-return branch:
  - `initJournalStorage()` — loads via `loadAllEntries()` IPC, skips IndexedDB/migration/persistent storage
  - `writeEntryToStorage()` — encrypt → `saveEntry(date, json)` IPC
  - `loadSingleEntry()` — `loadEntry(date)` IPC → parse → decrypt
  - `deleteSingleEntry()` — `deleteEntry(date)` IPC
  - `saveAllJournalEntries()` — loop entries, encrypt each, save via IPC
  - `reEncryptAllEntries()` — load all via IPC, decrypt old key, re-encrypt new key, save via IPC
  - `clearJournalStorage()` — load all dates, delete each via IPC
  - `getEncryptionMode()` / `setEncryptionMode()` — read/write `electronEncryptionMode` in localStorage
  - `setPasswordProtectedFlag()` / `getPasswordProtectedFlag()` — read/write `electronPasswordProtected` in localStorage
- `src/features/export/components/ExportButtons.tsx` — Electron branches for backup (native save dialog) and import (native open dialog). Shared `processBackupContent()` helper extracted to avoid duplication.

**Data format over IPC:** The `data` string is `JSON.stringify(encryptedRecord)` — same shape as IndexedDB (`{date, _enc, _payload, startedAt, lastModified}`). Electron stores this string as-is in `userData/entries/YYYY-MM-DD.json`.

**Typecheck:** Both `npm run typecheck` and `npm run typecheck:electron` pass clean.

### What's NOT done yet (next steps toward App Store)

1. **Smoke test** — Run `npm run dev:electron`, verify entries save/load/persist, backup/import dialogs work, web path has no regressions
2. **Electron packaging** — Set up `electron-builder` or `electron-forge` to produce `.app` / `.dmg`
3. **Code signing** — Apple Developer certificate, sign the app
4. **App Store sandboxing** — Entitlements, sandbox compliance
5. **Auto-update** (optional) — `electron-updater` + GitHub Releases so users don't have to re-download
6. **App Store submission** — Screenshots, metadata, Apple review

### Key design decisions
- **Intercept at the lowest level:** All Electron branches are in the private storage functions. Higher-level code (debouncing, encryption, multi-tab sync, auth gating) routes through automatically.
- **Web path untouched:** Every change is behind `isElectron()` — PWA works identically.
- **Metadata in localStorage:** Electron uses `electronEncryptionMode` and `electronPasswordProtected` localStorage keys instead of IndexedDB metadata store.
- **BroadcastChannel:** Harmless no-op in Electron (single window).
- **fallbackMode:** Never triggers in Electron since IndexedDB is never opened.
- **Two separate deploys:** PWA auto-deploys on push to main (GitHub Pages). Electron requires a separate build + package step.

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

## Maintenance Mode (v2.3.32+)

A quick-deploy gate that replaces the entire app with a fullscreen message. Used when fixing critical bugs so users don't hit broken state.

**Config file:** `src/shared/maintenance.ts`
- `MAINTENANCE` — boolean flag
- `MESSAGE` — the text shown (e.g. `'[under construction]'`)

**How it works:** `main.tsx` checks the flag before any React code loads. When enabled, it renders a static `innerHTML` screen (peach bg `hsl(28,100%,83%)`, black mono bold text — same style as the ErrorBoundary "something went wrong" screen). No React, no components, no app code runs.

**Workflow:** User says "push [under construction]" (or any bracketed message) → set `MAINTENANCE = true` and `MESSAGE = '[under construction]'` → bump version → push. User says "take it down" → set `MAINTENANCE = false`, `MESSAGE = ''` → push.

## Service Worker & Auto-Update (v2.4.7+, updated v2.4.13)

`main.tsx` handles SW registration manually (`injectRegister: false` in vite-plugin-pwa config).

- **Registration:** `/sw.js` with `updateViaCache: 'none'` (bypasses HTTP cache so Safari always checks)
- **Polling:** `registration.update()` every 60s to catch deploys without navigation
- **PWA resume check (v2.4.13+):** A `visibilitychange` listener at the SW registration level (in `main.tsx`, outside React) calls `registration.update()` when the page becomes visible after being hidden >3 seconds. This catches deploys when the PWA was frozen by the OS and the 60s polling timer was suspended. The 3-second threshold avoids unnecessary checks on quick app switches. This listener is completely independent of the WebSocket `visibilitychange` handlers in `useWebSync.ts` — they operate in different scopes (SW registration vs React hook).
- **Auto-reload:** `controllerchange` listener reloads the page when a new SW activates via `skipWaiting`. A `refreshing` flag prevents reload loops.
- **Workbox precache:** vite-plugin-pwa generates the SW with `skipWaiting()` + `clientsClaim()` (`registerType: 'autoUpdate'`). All JS/CSS/HTML are precached with content hashes.

Flow: deploy → new sw.js has new precache manifest → browser detects change within 60s (or on PWA resume) → installs new SW → `skipWaiting` activates it → `controllerchange` fires → page reloads with fresh assets.

**Cleanup (v2.4.13):** Removed dead `http-equiv` cache-control meta tags from `index.html` (browsers ignore these for actual caching — they only work as HTTP response headers). Removed manual favicon cache bust (`?v=4`) since Vite content-hashes all assets.

## Push Checklist (MANDATORY)

**EVERY push requires ALL of these steps. No exceptions.**

**SPEED RULE: Push first, verify deploy, document second.** Get the code change deployed ASAP. Documentation is a separate commit immediately after.

### Step 1: Push the code
1. **Increment version** in `src/shared/version.ts`
2. **Commit code changes + version bump**
3. **Push to main**

### Step 2: Verify deployment
4. **Wait ~30s then run `gh run list --limit 1`** to check the GitHub Actions workflow status
5. If still `in_progress`, wait and check again. If `completed success`, proceed. If `failure`, investigate and fix immediately (check logs with `gh run view <id> --log-failed`)
6. **Tell the user**: "Pushed **vX.Y.Z** — deploy successful" (or report the failure)

### Step 3: Document (immediately after)
7. **Update CLAUDE.md** with any changes to:
   - UI behavior or styling
   - Keyboard shortcuts or interactions
   - State management patterns
   - Any logic that future development should know about
8. **Commit and push** the documentation update
9. **Tell the user** what was documented

**If you push without documenting, you have failed.** The user should never have to remind you. But always get the code out the door first.


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

## WebSyncBridge (Live Sync)

The WebSyncBridge feature (phone-to-desktop sync) is **shipped and active** (v1.10.67+). The `src/shared/sync/` directory contains all sync files, and `WebSyncBridge` is rendered in the `App` component (sibling of `AppContent`, inside `ThemeProvider`).

**Important:** `WebSyncBridge` renders at the `App` level, NOT inside `AppContent` (v2.4.5+). This ensures the WebSocket connects to the relay immediately on page load, even when the lock screen is showing. `sessionStorage` is per-tab, so new tabs start locked — if WebSyncBridge were gated behind the lock screen, the new tab's WS would never connect, and the phone pairing would stay on the old tab.

### Relay Server

| Environment | URL | Server |
|-------------|-----|--------|
| Production | `wss://relay.gdays.day/ws` | Fly.io (`good-days-relay`) |
| Development | `ws://localhost:5173/ws` (Vite proxy → `localhost:3001`) | Local relay |

Server code: `server/src/relay.ts`, deployed via `server/Dockerfile` + `server/fly.toml`.

To redeploy: `cd server && fly deploy`

### Server-Side IP Hashing (v2.1.37+)

Raw client IPs are hashed immediately in `server/src/index.ts` using SHA-256 (truncated to 16 hex chars) before reaching application code. The relay never sees or logs raw IPs — only hashed tokens. Same-network devices produce the same hash, so IP-based grouping and pairing still works. Clients no longer send `publicIp` in the `register` message (field removed from protocol). The `fetchPublicIp()` function and `ipify.org` API calls were removed from both `useMobileSync.ts` and `useWebSync.ts`.

### WebSocket Keep-Alive (v2.1.6+)

The relay server pings each client every 30 seconds (`ws.ping()`). If no pong is received within 10 seconds, the connection is terminated (`ws.terminate()`) and the stale client record is cleaned up.

**Why this is critical:** Without pings, idle desktop connections silently die (Fly.io proxy timeout, network change, laptop sleep). The server still holds a ghost client record. When the phone connects and looks for laptops, it finds the ghost — or the ghost was already cleaned up by a failed `send()`, but the desktop client doesn't know it's disconnected. The desktop's `onclose` never fires, so it never reconnects. Result: user must refresh to get live mode working.

With pings, stale connections are detected within 40 seconds (30s interval + 10s timeout). The `ws.terminate()` fires the client's `onclose`, triggering automatic reconnect.

### Desktop Wake-from-Sleep Reconnect (v2.1.22+)

When a laptop sleeps, the WebSocket connection dies on the server (killed by keep-alive pings) but the browser doesn't know — `onclose` never fires, so the desktop never reconnects. The phone then finds a ghost connection on the relay and pairing fails.

**Fix:** `useWebSync.ts` now tracks `lastWsActivityRef` (updated on `onopen` and every `onmessage`). A `visibilitychange` listener fires when the page becomes visible. If it's been >45 seconds since the last activity (at least one server ping missed), the connection is considered dead. The handler force-closes the stale WebSocket, resets backoff to 1000ms, and calls `connect()` immediately.

**Why 45 seconds:** The server pings every 30s. If we haven't received anything in 45s, we've missed at least one full ping cycle, meaning the connection is dead. This threshold avoids false positives from normal tab switches (where the connection stays alive and messages flow).

**Why not close on hidden (like mobile does):** The mobile closes its WebSocket when backgrounded because leaving the phone app means you're not using it. Desktop tabs stay open while switching between apps — closing the WebSocket on every tab switch would be disruptive and unnecessary. Instead, we only reconnect on `visible` if the connection is actually stale.

Code: `handleVisibility` listener + `lastWsActivityRef` in `useWebSync.ts`.

### PWA Freeze-Resilient Reconnect (v2.2.7+)

Chrome aggressively freezes backgrounded PWA JavaScript. The relay kills the WebSocket (keep-alive timeout), but the frozen client never processes the close frame — `onclose` never fires and `readyState` still shows `OPEN`. When the user clicks back into the PWA, the 45-second staleness check may not trigger (if backgrounded < 45s), and the `readyState` check says "still open." Result: zombie WebSocket, no pairing, user must refresh.

**Fix:** `handleVisibility` now tracks `hiddenAtRef` (set on `visibilitychange: hidden`). When the page becomes visible in standalone/PWA mode (`display-mode: standalone`), if hidden > 3 seconds, force-close and reconnect regardless of staleness or readyState. The 3-second threshold avoids unnecessary reconnects for instant app switches while catching all frozen connections (server kills after 40s).

**Three reconnect triggers (OR'd):**
1. `stale` — no WS activity in 45s (original wake-from-sleep check)
2. `dead` — wsRef null or readyState > OPEN
3. `pwaFrozen` — standalone mode + hidden > 3s (new)

Normal desktop tabs still use the 45s staleness check only. PWA mode is more aggressive because Chrome's freeze behavior makes `readyState` unreliable.

Code: `hiddenAtRef` + `isStandalone` + `pwaFrozen` check in `handleVisibility`, `useWebSync.ts`.

### WebSocket onclose Race Fix (v2.1.31+)

When the phone goes background then foreground (or the desktop does visibility/leader changes), a race condition could silently kill the new WebSocket connection:

1. `hidden` handler: calls `ws.close()`, sets `wsRef.current = null`
2. `visible` handler: creates new WS, sets `wsRef.current = newWs`
3. Old WS's `onclose` fires asynchronously, sets `wsRef.current = null` (kills new WS ref!)
4. New WS opens, `sendMsg(register)` finds `wsRef.current` is null, registration silently dropped
5. Phone appears connected but relay never gets registration, no pairing, no sync

**Fix:** `onclose` now checks `wsRef.current === ws` before clearing the ref. If a newer WS already replaced it, the stale `onclose` is a no-op. Applied in both `useMobileSync.ts` and `useWebSync.ts`.

**Symptoms before fix:** Desktop rapid connect-disconnect cycling in relay logs; phone connections with no REGISTER message; mobile live control failing after any background/foreground cycle.

### Leader Handoff State Cleanup (v2.3.23+)

When a tab loses leadership (user switches focus to another tab), the `onLoseLeadership` callback closes the WebSocket and sets `wsRef.current = null`. The subsequent `ws.onclose` event checks `wsRef.current === ws` (the onclose race guard), but since `wsRef` is already `null`, the guard skips `startGrace()`. Result: `livePreset` is never cleared, and the old tab keeps showing the [live] button even though it's no longer connected.

**Fix:** `onLoseLeadership` now clears live state directly (sets `livePreset: null`, clears `isStreaming`, `streamingControls`, etc.) and cancels any pending grace timer. This is an immediate clear (not a grace period) because losing leadership is definitive — the tab is giving up control.

**Symptoms before fix:** Both Chrome tabs showing [live] button, but only the focused one responding to phone color updates.

Code: `onLoseLeadership` callback in `useWebSync.ts` (line ~227).

### DNS (Cloudflare)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `relay` | `good-days-relay.fly.dev` | DNS only (gray cloud) |

**Must be DNS only** — Cloudflare proxy (orange cloud) causes Error 1033 since there's no Tunnel configured.

### Latency Optimization: Flattened State Chain (v2.0.1+)

Color updates from the phone follow a **direct callback** path instead of a React effect chain:

**Before (3 render cycles):**
1. `useWebSync` setState(livePreset) → render 1
2. `WebSyncBridge` effect → `theme.setLivePreset()` → render 2
3. `WebSyncBridge` effect → `theme.applyPreset()` → render 3

**After (1 render per animation frame, v2.3.11+):**
1. `ws.onmessage` → `onColorUpdate` callback increments `colorUpdateCountRef` + buffers latest colors in a ref
2. `useWebSync` skips setState for ongoing color-updates (only updates on initial null→value transition)
3. `requestAnimationFrame` callback reads buffered colors → calls `setLivePreset` + `applyPreset` → 1 render

Multiple WS messages arriving within the same animation frame are coalesced — only the latest colors are applied. This caps React renders at the display refresh rate instead of the WS message rate, preventing periodic timer work (localStorage writes, statistics ticks) from overflowing the frame budget and causing dropped frames.

The `onColorUpdate` callback fires synchronously from `ws.onmessage` in `useWebSync` but only mutates refs (no setState). A `skipBridgeRef` flag prevents the bridge effect from double-applying. Pairing (null→value), disconnect (value→null), and save-preset still use effect chains (not latency-sensitive).

**v2.1.7 fix:** `applyPreset` was previously gated behind `isLiveActive` in the callback. But `isLiveActive` is set by a React effect (async), so on reconnect, color-update messages could arrive before the effect fired. Colors were set in `livePreset` but never applied. Now `applyPreset` is called unconditionally — if the relay is forwarding color-update, we're paired by definition.

### StatsDisplay Memoization (v2.3.18+)

All expensive stats calculations in `StatsDisplay.tsx` are wrapped in `useMemo`:

| Calculation | Complexity | Memoized on |
|---|---|---|
| `streak` | O(N) | `[entries]` |
| `totalWords` | O(N) | `[entries]` |
| `techStats` (maxStreak, lexicon, entriesPerWeek, totalLogins) | O(N*M) | `[entries, stacked]` |

**Why this matters:** StatsDisplay consumes `useTheme()` and re-renders on every color change. During 60fps streaming, the unmemoized calculations (especially lexicon at O(N*M) with regex per word per entry) were running 60x/sec — 50-200ms per frame against a 16.67ms budget. With `useMemo`, they only recalculate when `entries` actually changes.

### Streaming Effect Throttling (v2.3.19+)

During 60fps streaming, two effects in `ThemeContext.tsx` are skipped to stay within the 16.67ms frame budget:

| Effect | Cost per frame | Guard |
|---|---|---|
| Color save (6 × `setItem` with XOR encryption) | ~2ms | `if (isLiveStreaming) return` |
| Safari toolbar (HSL→hex + 3 DOM writes) | ~1ms | Sets `#000000` during live mode (v2.3.21+) |

The color save effect has `isLiveStreaming` as a dependency. The Safari toolbar effect has `isLiveActive` as a dependency. When live mode ends (phone disconnects), `isLiveActive` flips false → toolbar effect fires → restores the computed bg color.

**Safari toolbar during live mode (v2.3.20+, updated v2.3.21):** The toolbar is set to pure black (`#000000`) for the entire live mode session — from pairing until the phone disconnects. Originally gated on `isLiveStreaming` (v2.3.20), which only covered active streaming (finger on screen), causing a distracting color change when the user lifted their finger between drags. Changed to `isLiveActive` (v2.3.21) so the toolbar stays black the whole time. The flex container's inline `style={{ backgroundColor: ... }}` handles the visual background during live mode.

**Why this is safe:** Visual colors are already updated by React inline styles (the flex container's `style={{ backgroundColor: ... }}`). The localStorage writes are persistence concerns that can wait until streaming ends.

**History:** This was attempted in v2.3.15 but reverted because the user reported worse performance. That was before the v2.3.18 StatsDisplay memoization fix — the 50-200ms/frame StatsDisplay recalculations dwarfed the ~3ms savings. With StatsDisplay fixed, the ~3ms savings matter (reduces ~12-15ms/frame to ~9-12ms, safely within budget).

### skipBridgeRef Disconnect Fix (v2.3.19+)

The `skipBridgeRef` in `WebSyncBridge.tsx` prevents double-applying colors when both the rAF callback and the bridge effect try to set `theme.livePreset`. During streaming, the rAF callback sets `skipBridgeRef = true` every frame, but the bridge effect never fires (because `syncState.livePreset` doesn't change during streaming — `useWebSync` skips setState for ongoing color-updates). This leaves `skipBridgeRef` permanently true.

**The bug:** When streaming ends and the phone disconnects, `syncState.livePreset` goes null → bridge effect fires → but `skipBridgeRef` is true → effect skips → `theme.setLivePreset(null)` never called → `theme.livePreset` stays stale → live button stays visible.

**The fix:** The bridge effect now only skips non-null transitions. Null transitions (disconnect) always propagate regardless of `skipBridgeRef` state:

```typescript
if (skipBridgeRef.current) {
  skipBridgeRef.current = false;
  if (syncState.livePreset) return; // Only skip value→value, never value→null
}
```

Code: `src/shared/sync/WebSyncBridge.tsx` (bridge effect, line ~65)

### Disconnect Grace Period (v2.1.0+, updated v2.4.15)

When the phone disconnects (swipe away, tab close, etc.), `useWebSync` waits `GRACE_MS` (200ms) before clearing `livePreset` and `streamingControls`. This prevents the desktop from flashing back to its own colors during brief network blips. Previously 2500ms → 500ms → 200ms (v2.1.28) for snappier disconnect feedback. Total latency from phone swipe-away to live icon gone: ~300ms.

**Reconnect grace (v2.4.15+):** The `registered` handler now calls `startGrace()` on every registration. This fixes a bug where force-reconnecting (visibility handler or stale-check) left `livePreset` stale because the old WS's `onclose` race guard (`wsRef.current === ws`) prevented `startGrace()` from being called. The `paired` handler cancels the grace timer if the phone is still connected (server sends `paired` synchronously after `registered` during same-device dedup). If no `paired` follows (phone is gone), the grace fires and clears live state after 200ms.

### Phone Visibility Disconnect (v2.1.4+)

The phone immediately closes its WebSocket when the page goes hidden (home screen, app switcher, tab switch). When the page becomes visible again, it reconnects immediately. This makes the desktop exit live mode within ~300ms of the user leaving the phone app (relay latency + 200ms grace), and re-enter live mode as soon as they come back.

**Implementation:** `visibilitychange` listener in `useMobileSync.ts`:
- `hidden` → set `hiddenRef=true`, close WS, clear streaming state, cancel reconnect timer, reset backoff
- `visible` → set `hiddenRef=false`, reset backoff, call `connect()` immediately

**Bug fix (v2.1.5):** Closing the WS triggers `onclose`, which calls `scheduleReconnect()`. Without the `hiddenRef` guard, the phone would schedule a reconnect while backgrounded, defeating the purpose of the visibility disconnect. `scheduleReconnect` now checks `hiddenRef.current` and bails if hidden.

Without this, the WS would stay open until the OS kills it or the server times it out, leaving the desktop stuck in live mode for seconds after the phone is backgrounded.

### WebSocket onclose Race Guard (v2.1.32+)

Both `useMobileSync.ts` and `useWebSync.ts` now guard `ws.onclose` with `if (wsRef.current === ws)`. This prevents a stale WebSocket's `onclose` from nulling a newer connection's ref. Race condition: visibility change or leader election creates a new WS before the old one's `onclose` fires. Without the guard, the stale `onclose` would set `wsRef.current = null`, breaking the new connection.

### Same-Device Dedup / Last Tab Wins (v2.4.0+)

Replaces the BroadcastChannel leader election (`leaderElection.ts` deleted). Every desktop tab connects to the relay immediately on mount. The relay tracks `deviceConnections: Map<deviceId, clientId>`. When a second tab from the same device registers, the relay:

1. Closes the old WS with code `4001` ("superseded")
2. If the old tab was paired with a phone, re-pairs the phone with the new tab **synchronously** after registration (phone never sees `unpaired`)
3. Replays stream state to the new tab if the phone was streaming

**Synchronous re-pair (v2.4.5+):** The re-pair happens inline in `handleRegister` right after the new client is registered and `registered` is sent. Previously used `setTimeout(0)` which created a race window where `notifyWatchingPhones` could interfere. Now the `paired` message is sent immediately after `registered`, and `notifyWatchingPhones` correctly sees the phone as already paired.

**Desktop handling of code 4001:** `useWebSync.ts` sets `dormantRef = true` on close code 4001 — clears all live state silently and stops reconnecting.

**Dormant tab reclaim (v2.4.4+):** When a dormant tab becomes visible (`visibilitychange` → `visible`), it clears `dormantRef` and reconnects. The relay supersedes the other tab (code 4001) and re-pairs the phone atomically. This means the focused/active tab always wins — switching between tabs transfers live sync automatically.

**Why this is simpler:** No BroadcastChannel messages, no heartbeats/watchdogs, no race windows. Server-side dedup is authoritative. Works across tabs in the same browser automatically since `deviceId` is shared via localStorage. Different browsers have separate `deviceId`s (separate localStorage), so cross-browser dedup does not apply — each browser registers as a separate device.

Code: `deviceConnections` Map in `relay.ts`, `dormantRef` + `handleVisibility` in `useWebSync.ts`.

### Pairing Logic Framework (v2.4.14+)

**Same wifi = matched automatically. Different wifi = 3-digit code.** Everything else is resolving edge cases within those two buckets.

#### Same Wifi

- **1 laptop, 1 phone → auto-pair.** Phone opens, finds laptop on same network, paired instantly. No screen, no interaction.
- **2+ laptops, 1 phone → "which one is yours?"** Phone shows a picker with "refreshed Xs ago" timestamps. Tap one → paired. If one laptop disconnects and only 1 remains → auto-pairs automatically (process of elimination). If ALL disconnect → falls through to 3-digit code.
- **1 laptop, 2+ phones → last phone wins.** New phone evicts the old phone from the laptop. Physical phone in hand always wins over a stale session.

#### Different Wifi

- **Phone can't find any laptops on its network → 3-digit code.** Phone shows "enter your desktop code." Laptop shows its code on title hover. Code is random each session (new on every reconnect). Code only shows on the laptop when a phone is actively looking for it, and only on unpaired laptops.

#### Disconnection / Reconnection

- **Phone backgrounds → desktop exits live mode (~300ms).** Phone comes back → reconnects → same pairing logic runs fresh.
- **Laptop closes/refreshes → 3s grace period.** Relay holds the phone's pairing. Laptop returns within 3s → seamlessly re-paired, phone never notices. After 3s → phone re-evaluates (auto-pair if 1 laptop, candidates if 2+, code if 0).
- **Laptop tab switch (same browser) → instant handoff.** New tab supersedes old tab atomically. Phone re-paired with new tab, stream state replayed. Old tab goes dormant. Switch back → reclaims connection, same atomic handoff.

#### Skip Bypass (v2.4.20+, was "Don't Connect")

On candidates picker and code-entry screen, "skip" closes the WebSocket and enters standalone mode. Background + foreground clears the skip and reconnects fresh. Only appears when there's ambiguity (2+ laptops) or no match (0 on same wifi). Auto-pair (1 laptop) happens before any screen is shown.

### Pairing Code Fallback (v2.4.0+, updated v2.4.14)

When phone and desktop are on different networks (different IPs), IP-based auto-pair can't work. Each desktop is assigned a 3-digit pairing code on registration, derived from `clientId` (v2.4.14+, was `deviceId` before): `parseInt(clientId.slice(0,6), 16) % 1000`, zero-padded. If taken, increments+wraps until free. Since `clientId` is a fresh UUID per connection, the code rotates each session (reconnect, tab switch, page refresh).

**Desktop (v2.4.17+):** Title shows the 3-digit pairing code by default (no hover needed) when a phone is actively on the "enter your desktop code" screen. When no phone is looking, title shows "good days" normally. On hover, title always shows "good days v{VERSION}" regardless of pairing state. The code is never visible during normal use, live mode, or when no phone is actively trying to pair via code.

**Relay-driven code visibility (v2.4.12+, scoped v2.4.14):** The relay tracks which phones are in code-entry mode via `phonesInCodeEntry` Set. When a phone enters or leaves the enter-code screen, the relay broadcasts `{ type: 'code-visible', visible: boolean }` to **unpaired laptops only** (v2.4.14+). Paired laptops can't accept code-based pairing, so showing the code is pointless noise. Desktop `useWebSync` stores the pairing code in a ref on `registered` (persists across pair/unpair cycles — NOT cleared on `paired`), but only exposes it via React state when `code-visible: true`. On `code-visible: false` or `paired`, state is cleared to null.

**Phone enters code-entry when:**
- 0 unpaired laptops on same IP during registration
- 0 unpaired laptops after eviction re-check
- 0 unpaired laptops after grace timer expiration
- `enter-code` sent from `notifyWatchingPhones`

**Phone leaves code-entry when:**
- Successfully paired (via `pairClients`)
- Phone disconnects (cleanup in `handleDisconnect`)
- Candidates become available (2+ laptops, phone gets `candidates` message)

**New laptop edge case:** When a laptop registers while phones are already in code-entry, it receives `code-visible: true` immediately after its `registered` message.

**Phone:** When 0 desktops found on same IP, relay sends `{ type: 'enter-code' }`. Phone shows centered "enter your desktop code" with a 3-digit numeric input (48px monospace, auto-submits on 3 digits). iOS keyboard pushes the title off screen naturally (no viewport hacks). On submit, sends `{ type: 'pair-by-code', code }` to relay. Relay looks up the code in `pairingCodes` Map and pairs. **Auto-clear on submit (v2.4.8+):** Input auto-clears after 1 second so user can retry if code was wrong or connection failed. If pairing succeeds, the screen hides before the clear fires.

**Relay error handling (v2.4.8+):** `handlePairByCode` now logs all exit paths (code not found, laptop disconnected, laptop already paired) and sends `enter-code` back to the phone on failure. This gives the phone a signal that the attempt failed (the enter-code re-receipt is harmless if already in that state).

**Code lifecycle:** Assigned on laptop register (new code each session since `clientId` is fresh per connection, v2.4.14+), stored in `pairingCodes: Map<code, clientId>`. Released on disconnect via `releasePairingCode()`. Desktop state driven by `code-visible` messages from relay (only sent to unpaired laptops, v2.4.14+).

Code: `assignPairingCode()`, `pairingCodes` Map, `phonesInCodeEntry` Set, `phoneEnterCodeEntry()`/`phoneLeaveCodeEntry()`/`broadcastCodeVisibility()` in `relay.ts`. `pairingCodeRef` + `code-visible` handler in `useWebSync.ts`, bridged through `ThemeContext` → `App.tsx` title.

### IP-Based Pairing (v2.4.0+, simplified from v2.1.x)

The pairing hierarchy was simplified from 3-tier (secret → affinity → IP) to IP-only with code fallback:

| Desktops on IP | Phone behavior |
|---|---|
| 1 unpaired | Auto-pair silently |
| 2+ unpaired | Show candidates picker with live `connectedAgo` timestamps |
| 0 | Show code entry screen |

**Removed:** `secret` field, `partnerDeviceId` field, `findAffinityMatch()`, `pickBestLaptop()`, `claim-laptop` message, `candidate-update` message, `no-candidates` message. Clients no longer store `wsSecret` or `wsPartnerDeviceId` in localStorage.

**Kept:** Phone takeover (evict stale phone when new phone connects and all laptops are taken). `notifyWatchingPhones(ip)` re-evaluates all unpaired phones when IP group changes.

**Auto-pair on candidate drop (v2.4.14+):** When an unpaired laptop disconnects, `notifyWatchingPhones` is called for its IP group. If a phone was on the candidates screen (2+ laptops) and now only 1 laptop remains, the phone auto-pairs. If 0 remain, the phone goes to enter-code. This makes the hierarchy reactive: process of elimination resolves to auto-pair.

### Relay Handoff Grace Period (v2.1.15+, updated v2.4.0)

When a paired laptop disconnects, the relay delays unpairing the phone by `HANDOFF_GRACE_MS` (3000ms). This prevents the phone from flashing back to the pairing screen during page refreshes or tab switches.

**How it works:**
1. Laptop disconnects → relay starts 3s timer, clears phone's `partnerId` but does NOT send `unpaired`
2. Same-device dedup handles tab switches atomically (new tab re-pairs phone before old tab's disconnect even fires)
3. Timer expires with no new laptop → sends `unpaired` to phone, re-evaluates (auto-pair if 1 desktop, candidates if 2+, enter-code if 0)

**Stream state replay:** When a new laptop pairs during grace, `replayStreamToLaptop()` sends `stream-start` + `stream-state` + `color-update` so the new laptop picks up seamlessly. Snapshots stored on phone's `ClientRecord`: `lastColors`, `lastStreamSide`, `lastStreamState`.

Code: `handoffTimers` map + `replayStreamToLaptop()` in `relay.ts`.

### Candidates Picker (v2.4.0+, redesigned v2.4.20)

When 2+ unpaired desktops on same IP, phone shows a picker:
- Header: "which one is yours?"
- Each button shows only `"refreshed {X}s ago"` / `"refreshed {X} min ago"` — no "desktop N" label
- Bold sweep animation (83ms/char) runs continuously on the refresh text, maxCount computed from actual displayed text lengths (no dead zone between sweeps)
- Buttons match mobile button width (`9ch` at `min(17vw, 70px)` font size), centered, 7px padding (aux role)
- Styled with phone's current colors, 4px border (60% resting, 100%+fill on press)
- Local `setInterval` every 1000ms increments age counters; server `candidates` messages reset to server values
- Seconds tick live; switches to "X min ago" after 60s

**Green refresh flash (v2.4.20+):** When a candidate's `connectedAgo` drops from >3 to ≤1 (desktop refreshed), the candidate gets a triple green flash (3 on/off cycles over 1.2s) using `confirmColor` on border, background (20% opacity), and text. The refreshed candidate is sorted to the top of the list.

**Spacing (v2.4.20+):** Header to first button = 24px (parent gap). Button to button = 12px (candidates container gap). Candidates to divider = 24px (parent gap between candidates container and divider+skip container). Divider to skip = 24px (divider+skip container gap).

**Mock screen:** `?mock=pairing` URL param shows the candidates screen with mock data for testing.

Code: pairing screen in `MobileApp.tsx`, `buildCandidatesList()` in `relay.ts`.

### Code Entry Screen (v2.4.0+, updated v2.4.20)

When 0 desktops on same IP, phone shows code entry:
- Header: "enter your desktop code" (centered, 20px monospace bold)
- 3-digit numeric input (48px monospace, 4px themed border, auto-submits on 3 digits)
- Input inside `9ch` responsive container at `fontSize: 'min(17vw, 70px)'` (matches candidates screen layout)
- Input and label vertically centered in space below title (`flex: 1` + `justifyContent: center`)
- iOS keyboard naturally pushes "good days" title off screen (accepted behavior)
- Sends `pair-by-code` to relay, which looks up code in `pairingCodes` Map

**Code rejection UX (v2.4.20+):**
- Cursor hidden after 3 digits (`caretColor: transparent` when `codeInput.length >= 3`)
- On server rejection: `codeRejectedCount` incremented in `useMobileSync.ts` (detects `enter-code` received while already in `enter-code` state)
- Input clears instantly, 3 red dashes "---" overlay in `errorColor` with red border flash for 1.5s
- Input stays focused throughout — user can immediately type next attempt
- Overlay uses `pointerEvents: 'none'` so input captures keystrokes through it

Code: code entry screen in `MobileApp.tsx`, `handlePairByCode()` in `relay.ts`, `codeRejectedCount` in `useMobileSync.ts`.

### Skip Button (v2.4.20+, was "Don't Connect" v2.4.12+)

Both the candidates picker and code entry screens show a 2px divider line and "skip" button below the main content. Styled as an `aux`-role button (7px padding, 4px border, 12px radius). Same drag-off cancellation pattern as other mobile buttons (`skipEngaged` ref + `isTouchInside`).

**Spacing (v2.4.20+):** Button-to-divider and divider-to-skip are 24px. On the candidates screen, divider + skip are in a separate `9ch` container (sibling to the candidates container which uses 12px gap for button-to-button). On the code entry screen, the entire input + divider + skip container uses 24px gap.

**Behavior:** Tapping "skip" calls `sync.skipPairing()` which closes the WebSocket, sets `pairingState` to `'standalone'`, and sets `skippedPairingRef = true` to prevent reconnection. The phone goes to standalone mode (home screen, no live sync). If the user backgrounds and returns to the app, `skippedPairingRef` is cleared and the WS reconnects normally.

**Auto-pair unchanged:** When 1 desktop is on the same wifi, the relay auto-pairs without showing any screen — the "skip" option only appears on the candidates picker (2+ desktops) and code entry (0 desktops on same IP).

Code: `skipPairing()` in `useMobileSync.ts`, "skip" buttons in `MobileApp.tsx`.

### Live Stats (removed in v2.3.12)

The live stats section (hue travel, sl travel, hz, live saves) was removed from the powerstat display. The `useLiveStats` hook in `src/features/statistics/hooks/useLiveStats.ts` is now orphaned (not imported anywhere). `phoneSaveCount`, `incrementPhoneSaveCount`, and `colorUpdateCountRef` were removed from ThemeContext since they existed solely for live stats. WebSyncBridge no longer increments `colorUpdateCountRef` or calls `incrementPhoneSaveCount`. The orphaned localStorage keys (`liveHueDistance`, `liveHslDistance`, `liveLiveSaves`) will persist harmlessly in existing users' browsers.

### Future: WebRTC DataChannel Migration

The biggest remaining latency bottleneck is the **network round-trip through the Fly.io relay** (~20-80ms depending on location). A WebRTC DataChannel would establish a direct peer-to-peer connection between phone and laptop (same LAN), reducing latency to ~1-5ms.

**Architecture:**
1. Use the existing WebSocket relay as a **signaling server** for WebRTC offer/answer/ICE exchange
2. Once the DataChannel is established, send color updates directly peer-to-peer
3. Fall back to the relay if WebRTC fails (NAT traversal issues, etc.)

**Implementation plan:**
1. Add `RTCPeerConnection` setup in both `useMobileSync.ts` and `useWebSync.ts`
2. Exchange SDP offers/answers via the relay WebSocket (new message types: `rtc-offer`, `rtc-answer`, `rtc-ice`)
3. Add ICE candidate exchange
4. Open a `RTCDataChannel` named `colors`
5. Send `color-update` messages over the DataChannel instead of WebSocket
6. Keep the WebSocket alive for signaling, pairing, save-preset, and as a fallback

**New relay message types needed:**
```typescript
| { type: 'rtc-offer'; sdp: string }
| { type: 'rtc-answer'; sdp: string }
| { type: 'rtc-ice'; candidate: RTCIceCandidateInit }
```

**Considerations:**
- STUN server needed for ICE (free: `stun:stun.l.google.com:19302`)
- TURN server NOT needed if phone and laptop are on the same network (typical use case)
- DataChannel messages can be binary (ArrayBuffer) instead of JSON for further savings (~negligible)
- The relay fallback ensures it still works on different networks

**Estimated effort:** Medium (half-day). The WebSocket relay stays as-is — just add passthrough for RTC signaling messages.

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

- `src/features/` - Feature-based modules (auth, journal, theme, settings, statistics, export, mobile)
- `src/features/mobile/` - Mobile color picker app (code-split, loaded dynamically on mobile devices)
- `src/hooks/` - App-level custom hooks (`useLayoutState`, `useMidnightTimer`)
- `src/shared/` - Shared utilities and components
- `src/shared/crypto.ts` - AES-GCM encryption utilities (used by auth, export, and storage)
- `src/shared/utils/html.ts` - Centralized HTML-to-text stripping
- `src/shared/copy/aboutCopy.ts` - Single source of truth for about page copy (used by AboutPanel + README)
- `src/index.css` - Global styles including scrollbar-hide utility

### About Page ↔ README Sync (v2.2.4+)

The about page copy and `README.md` are architecturally linked via `src/shared/copy/aboutCopy.ts`. `AboutPanel.tsx` imports from it; `scripts/generate-readme.ts` generates `README.md` from it. To update the about copy, edit `aboutCopy.ts` then run `npm run generate-readme` to regenerate the README.

**Inline emphasis (v2.4.17+):** `aboutCopy.ts` supports `*word*` syntax for italic text. `AboutPanel.tsx` has a `renderWithEmphasis()` helper that splits on `*...*` and wraps matches in `<em>`. Currently used in features paragraphs (`settings *and* about`). The scramble function `s()` is applied per-segment so superscramble still works.

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

**Stale save cancellation (v2.3.31+):** When a tab receives a broadcast for a date, it cancels any pending debounced save for that date via `cancelPendingSave(date)` before reloading the entry. This prevents a stale local save (queued before the broadcast arrived) from firing after the reload and overwriting the other tab's newer content. Without this, two tabs editing today would ping-pong: Tab A saves → Tab B receives and overwrites editor → but Tab B's stale debounced save fires → overwrites Tab A's content → Tab A receives and overwrites → infinite loop.

### Write Debouncing (v1.10.0+)

Every keystroke updates `entriesRef` in memory immediately, but IndexedDB writes are debounced by **300ms**. This batches rapid typing into one write instead of one per character.

**Key functions in `journalStorage.ts`:**

| Function | Purpose |
|----------|---------|
| `saveSingleEntry(entry)` | Queues a debounced write (300ms) |
| `cancelPendingSave(date)` | Cancels a pending debounced save for one date (no write) |
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
3. Only then does the editor clear and date switch

This ensures the previous day's entry is persisted even if IndexedDB is slow or the tab closes right at midnight.

Code location: `src/hooks/useMidnightTimer.ts`

### startedAt Deferred Until First Keystroke (v1.10.58+)

The "ensure today's entry exists" effect in `useJournalEntries.ts` creates an empty placeholder entry for today (so the sidebar shows the day). This entry has **no `startedAt`**. The `startedAt` timestamp is only set when `saveEntry()` is first called (i.e., the user actually types). The fallback chain in `saveEntry` is: `existingEntry.startedAt || timestamp || Date.now()`.

**Before v1.10.58:** The placeholder was created with `startedAt: Date.now()`, so if the app was open at midnight, `startedAt` would be ~12:00 AM even if the user didn't type until hours later.

### Ensure Today — In-Memory Only (v2.3.30+)

The "ensure today" placeholder is **no longer persisted to IndexedDB**. It exists only in React state (for the sidebar) until the user actually types, at which point `saveEntry()` writes it.

**The bug this fixes:** If an encrypted entry failed to decrypt (wrong key, transient error, etc.), `decryptEntry()` returned `null` and the entry was silently filtered out of the loaded list. The "ensure today" effect then saw no today entry → created an empty one → called `saveSingleEntry()` → **permanently overwrote the encrypted data** in IndexedDB with an empty plaintext entry. Content gone forever.

**Two-layer protection:**
1. **In-memory only:** The placeholder is never written to IndexedDB. Encrypted data is never overwritten by the placeholder.
2. **Decryption failure guard:** If today's date specifically failed to decrypt, the effect skips entirely (no placeholder created). `hasDecryptionFailure(date)` checks a module-level `Set` in `journalStorage.ts` populated during `decryptEntry()` catch blocks.

**Decryption failure tracking (`journalStorage.ts`):**
- `decryptionFailures` Set tracks dates that failed to decrypt
- Cleared at the start of each `initJournalStorage()` call
- `hasDecryptionFailure(date)` exported for use by `useJournalEntries`
- `getDecryptionFailures()` exported for diagnostics
- Console warning + action log entry when failures occur
- Logged as: `[gdays] N entries failed to decrypt and are hidden: YYYY-MM-DD, ...`

### State Sync Fixes (v1.10.60+)

**EntrySidebar interaction state reset:** When `selectedDate` changes (from clicking, arrow keys, or auto-focus), `hoveredEntry`, `clickedEntry`, and `keyboardFocusedEntry` local states are all cleared. A document-level `mouseup` listener also clears `clickedEntry` to handle mousedown-then-scroll-away.

**Multi-tab editor sync:** `useJournalEntries` exposes an `externalContentVersion` counter that increments when another tab saves the currently viewed date. `JournalEditor` uses this to bypass its `loadedDateRef` guard and reload content from the updated entries. Scroll position is preserved (not reset) on external syncs.

**loadedDateRef async load guard (v2.3.31+):** `JournalEditor` tracks which date's content has been loaded into the textarea via `loadedDateRef`. Previously, on page refresh, the effect ran with `entries = []` (IndexedDB still loading), found no entry, set `value = ''`, and marked the date as loaded. When entries actually loaded from IndexedDB, the effect saw `loadedDateRef === selectedDate` and returned early — the real content was never displayed. Clicking away and back would work because it reset `loadedDateRef`. **Fix:** `loadedDateRef` is only set when `entry` is actually found. If entries is empty (still loading), the ref stays `null`, so the effect re-runs when entries populate.

**Zombie entry prevention:** `deleteSingleEntry()` in `journalStorage.ts` now cancels any pending debounced save for the deleted date before performing the delete. Previously, a 300ms debounced save could fire after the delete and re-write the entry.

**reloadEntries htmlToText:** `reloadEntries()` (used after password unlock) now calls `htmlToText()` before setting `currentContent`, consistent with all other code paths.

### Screen Copy Approval Policy

**All user-facing copy and screens must be approved by the user.** Do not add new text screens without approval. Currently approved:
- "something went wrong" (error boundary) — DEFAULT_PRESET_1 colors (black text on peach bg)

There is no loading screen (v2.2.8+). The app renders immediately with empty entries; content pops in once IndexedDB loads. Any new screens or copy require user sign-off.

### Lock Screen Must Be First Render Gate (v2.2.6+)

The lock screen check (`auth.isLocked && auth.hasPassword`) MUST be the first conditional return in `AppContent`. No other gates (loading, etc.) should come before it. Without this, password-protected users can't reach the lock screen because `encryptionKeyReady` stays `false` until the password is entered.

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

### beforeunload Flush (v2.1.35+)

On tab close, `flushPendingSaves()` fires all pending debounced IndexedDB writes immediately. This is best-effort (async writes may not complete before the tab closes), but since writes are debounced at 300ms, at most a few keystrokes are at risk.

**Removed in v2.1.35:** The previous `beforeunload` handler also wrote all entries as plaintext JSON to `localStorage` (`journalEntries` key) as a synchronous backup. This was removed because it stored all journal content in plaintext, completely bypassing password protection. The merge-on-init logic that recovered these backups was also removed.

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

### Encryption Details (Backups)

- **Algorithm**: AES-GCM (256-bit key)
- **Key derivation**: PBKDF2 with fixed app secret (non-extractable key)
- **IV**: Random 12 bytes per encryption (stored with ciphertext)
- **Salt**: `good-days-salt`
- **Code location**: `src/shared/crypto.ts` (`encryptText`/`decryptText`)

Note: This is obfuscation (prevents casual reading), not security. Anyone with source code access could decrypt backups.

### At-Rest Encryption (v2.2.0+)

Journal entries in IndexedDB are encrypted with AES-256-GCM. The encryption level matches the user's security posture:

| Password Set? | Key Source | Security Level |
|---|---|---|
| No | App-secret derived key | Obfuscation — stops casual DevTools snooping |
| Yes | Password-derived key (PBKDF2) | Real security — entries unreadable without password |

**On-disk shape in IndexedDB:**
```typescript
{
  date: string,              // plaintext (keyPath, can't encrypt)
  _enc: 'app' | 'password',  // which key encrypted this entry
  _payload: string,           // base64 AES-GCM ciphertext of JSON { content, title }
  startedAt?: number,         // plaintext (not sensitive)
  lastModified?: number,      // plaintext (not sensitive)
}
```

Only `content` and `title` are encrypted (sensitive text). Timestamps stay plaintext. Legacy entries (no `_enc` marker) are treated as plaintext and pass through.

**Encryption key lifecycle:**

| Has Password? | Session Active? | Flow |
|---|---|---|
| No | — | Derive app-secret key → load entries immediately |
| Yes | Yes (JWK in sessionStorage) | Import JWK → load entries immediately |
| Yes | No (fresh tab) | Show lock screen → user enters password → derive key, store JWK → load entries |
| Yes | Cookie wipe | Dead man's switch fires → entries nuked |

**Init order:** `useAuth` calls `initEncryptionKey()` on mount, which sets the encryption key in `journalStorage.ts`. `useJournalEntries` accepts `encryptionKeyReady` and defers `initJournalStorage()` until the key is available. When password-encrypted entries need the lock screen first, entries load after unlock via `reloadEntries()`.

**Key derivation:**
- App-secret key: PBKDF2 from `APP_SECRET` with salt `good-days-encrypt-salt` (extractable)
- Password key: PBKDF2 from user password with same salt (extractable)
- Both are separate from the backup key (different salt: `good-days-salt`, non-extractable)
- Keys cached in module-level variables to avoid repeated 100k iterations

**JWK session persistence:** Password-derived keys are exported as JWK and stored in `sessionStorage` (`gooddays_encryption_jwk`). Survives refresh, clears on tab close. On ESC lock, JWK is cleared from sessionStorage.

**Password transition flows (ordering is critical — re-encrypt BEFORE updating hash):**
- **Set password:** Derive password key → `reEncryptAllEntries(newKey, 'password')` → store password hash → store JWK
- **Change password:** Derive new password key → `reEncryptAllEntries(newKey, 'password')` → update hash → update JWK
- **Remove password:** Derive app key → `reEncryptAllEntries(appKey, 'app')` → remove hash → clear JWK

If re-encryption fails, entries remain encrypted with the old key and the old hash is still valid. No data loss.

**Plaintext migration:** On `initJournalStorage()`, if `encryptionMode` metadata is `'none'` (or missing) and a key is available, all entries are written back encrypted and the mode is updated. One-time, automatic.

**Fallback mode:** Encryption is skipped in localStorage fallback mode (IndexedDB failure). The synchronous localStorage path doesn't support async crypto.

**localStorage encryption (v2.2.0+):** `src/shared/storage/index.ts` encrypts all localStorage values with XOR cipher (static key `gdays-ls-cipher-v1`). Values prefixed with `$e:` are encrypted; unprefixed values are legacy plaintext (auto-decrypted on read). The `index.html` IIFE mirrors this decryption for pre-React theme loading.

**Key files:**

| File | Purpose |
|------|---------|
| `src/shared/crypto.ts` | All crypto primitives (key derivation, encrypt/decrypt, JWK) |
| `src/shared/storage/journalStorage.ts` | Encrypt on write, decrypt on read, re-encryption, migration |
| `src/features/auth/hooks/useAuth.ts` | Key lifecycle, `initEncryptionKey()`, password transitions |
| `src/shared/storage/index.ts` | localStorage XOR encryption |

**New exports from `journalStorage.ts`:**

| Function | Purpose |
|----------|---------|
| `setEncryptionKey(key, mode)` | Set the active encryption key |
| `reEncryptAllEntries(newKey, newMode)` | Re-encrypt all entries with a new key |
| `getEncryptionMode()` | Read encryption mode from metadata |

**New exports from `crypto.ts`:**

| Function | Purpose |
|----------|---------|
| `getAppEncryptKey()` | Derive extractable app-secret key for at-rest encryption |
| `encryptWithKey(plaintext, key)` | Encrypt with any CryptoKey |
| `decryptWithKey(ciphertext, key)` | Decrypt with any CryptoKey |
| `derivePasswordKey(password)` | Derive extractable key from user password |
| `exportKeyToJWK(key)` / `importKeyFromJWK(jwk)` | JWK export/import for sessionStorage |

**New exports from `useAuth.ts`:**

| Function/Field | Purpose |
|----------|---------|
| `encryptionKeyReady` | Boolean — true when key is available for storage ops |
| `changePassword(newPassword)` | Re-encrypt + update hash (for password change flow) |
| `initEncryptionKey()` | Standalone init function (called on mount) |

### Import Conflict Handling (v2.3.37+)

Entries are treated as **units** (title + content). When importing, entries are **merged** (not replaced). If an imported entry's date already exists:

1. **Exact match** (same content AND same title): Skip
2. **Already appended**: The formatted import block (`--- title content`) is found in the existing text → skip (prevents duplicates on re-import)
3. **Any difference** (content, title, or both): Append the imported entry below existing with a `---` separator. The imported title (if any) is always included after the `---`

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

The conflict separator is a clean `---`. The imported entry's title (if any) always appears after the separator:

```
[existing content]

---
a very rainy day

[imported content]
```

Without a title:
```
[existing content]

---
[imported content]
```

**Import block duplicate detection (v2.3.37+):** Instead of checking if the existing content *contains* the imported content (which would skip when existing is a superset), we check if the formatted import block (`--- title content`, normalized) already exists in the existing text. This only matches actual previous imports (content after a `---` separator), not organic content. This preserves fearless re-import while treating any actual difference as meaningful.

Code location: `src/features/export/utils/parseBackup.ts`

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
3. Compare titles (`(existing.title || '') === (imported.title || '')`)
4. Build import block: `--- ${normalizedTitle} ${normalizedContent}`
5. Skip if: empty import, exact match (content + title), or import block found in existing. Otherwise → append.

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

The import button hover text change in powerstat mode is a literal string change (not a tooltip - we don't use tooltips). The Download icon stays visible in both default and hover states (v1.10.24+) — only hidden during feedback (success/error).

### Fearless Import Philosophy

**Import should require zero mental overhead.** Users should be able to select an entire folder of backups - from different dates, different devices, with overlapping content - and just import them all. The app figures it out.

No duplicate content. No corruption. No "did I already import this?" No thinking required.

**Safeguards:**
1. Same date + identical entry (same content + same title) → skip entirely
2. Same date + already appended (import block found in existing) → skip (prevents re-appending)
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

**Failure handling (v2.1.27+):**
- Bad files (wrong format, decryption failure) are silently ignored during multi-file import
- Only shows "import failed" if ALL selected files fail — no valid file was decrypted and parsed
- If at least one file succeeds (decrypts + parses), shows "X entries imported" and ignores the bad ones
- Uses `anyFileSucceeded` flag set after successful decrypt+parse+merge, not entry count or array length

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

### Scramble Mode

When `isScrambled` is true:
1. Textarea text color is transparent
2. Overlay div shows scrambled text
3. Scroll position synced via `translateY(-${scrollTop}px)`
4. Scrambled text is memoized (`useMemo`) on `[value, scrambleSeed]` — re-scrambles when content changes or seed bumps

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

When activated, Option/Alt+S toggles scramble from anywhere in the app. The hotkey listener always calls `preventDefault()` on Alt+S regardless of activation state (v2.1.32+) to prevent macOS from inserting "ß" into the editor.

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

**Blackout overlay (v1.10.54+):** At step 3, a full-screen black overlay covers the viewport. The reset button stands out against it with the app's background color. The overlay is rendered via `createPortal` to `document.body` (zIndex 9998) to avoid stacking context issues from the settings panel's `overflow-y-auto`. The button wrapper uses zIndex 9999 with the app's background color and `rounded` corners.

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

In powerstat mode, the color stats area (txt/bg HSL values) shows copy/paste buttons on hover.

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

**Pairing Screen** (v2.1.15+, when multiple desktops detected):
```
┌────────────────────────────────┐
│          good days             │  ← title
│                                │
│     which one is yours?        │  ← 20px monospace bold
│                                │
│   ┌────────────────────────┐   │
│   │     desktop 1          │   │  ← candidate's colorway fill
│   └────────────────────────┘   │     4px border, 12px radius
│   ┌────────────────────────┐   │
│   │     desktop 2          │   │  ← different colorway
│   └────────────────────────┘   │
│                                │
└────────────────────────────────┘
```

Flex column layout, 12px gap, 320px max-width. Each button uses the candidate's colorway for fill and text color. Border follows `getButtonStyle` pattern (60% opacity resting, 65% lightness pressed). Full engage/disengage touch handling with `candidateEngaged` ref.

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

**Applied to pairing screen candidate buttons (v2.1.15+):** Each candidate uses its own `candidateEngaged` ref and `pressedCandidate` state for the same engage/disengage pattern. `selectCandidate` only fires if still engaged on touchEnd.

**Copy textarea Writing Tools prevention (v1.10.22+):** The temporary textarea used for `execCommand('copy')` now has `writingSuggestions="false"`, `autocomplete/autocorrect/autocapitalize` off, `spellcheck=false`, and explicitly blurs before removal to clear iOS text interaction state.

### iOS Permission

iOS 13+ requires explicit permission for DeviceOrientationEvent:
1. Permission screen shown on first visit
2. User taps "calibrate tilt" button
3. `DeviceOrientationEvent.requestPermission()` called
4. If granted, home screen shown
5. If denied, tilt controls won't work (hue-only mode)

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

**Paste validation (v2.1.32+, updated v2.3.11):** When pasted clipboard content doesn't match any supported format, the copy|paste split is replaced by a single full-width "invalid format" indicator for 1.5 seconds, then reverts to copy|paste. Desktop: rendered as a full-width `<div>` styled with `errorColor` from `getStatusColors()` (same WCAG error color used by "import failed"), dismisses when the mouse leaves the color stats hover region. Mobile: rendered as a full-width button (same `getButtonStyle` with position `'full'`), dismisses on any click or keystroke. No colors are applied. State: `pasteInvalid` boolean + `pasteInvalidTimer` ref. Works on both mobile (`main.tsx`) and desktop (`StatsDisplay.tsx`).

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

**Active thickness:** The indicator doubles from 4px to 8px when actively picking on that side (`isPicking && activeSide.current === side`). The thickness change is symmetric around the center — 2px added to each side.

**Above-bar snapping:** When the finger slides above the bar top (fast drag), the hue snaps to 359 (top) instead of getting stuck at the last tracked position. Below the bar, `processTouchAt` clamps to hue 0 (bottom).

### Title Version Display

Tap and hold the "good days" title on any screen to show the version number (e.g., "v1.10.7"). Title text replaces entirely with the version — no "good days" prefix. Releases back to "good days" on touch end. Works on all three screens (permission, home, picker).

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

## Color Presets

Default presets are defined in `src/features/theme/context/ThemeContext.tsx`:

| Preset | Text Color | Background Color | Description |
|--------|------------|------------------|-------------|
| **1** | hsl(215, 100%, 0%) black #000000 | hsl(28, 100%, 83%) peach #ffd1a8 | Default for new users |
| **2** | hsl(229, 61%, 100%) white | hsl(251, 100%, 59%) purple | — |
| **3** | hsl(360, 100%, 49%) red | hsl(360, 100%, 13%) dark red | — |
| **4** | hsl(241, 69%, 47%) blue | hsl(59, 100%, 66%) yellow | — |
| **5** | hsl(116, 100%, 53%) bright green | hsl(96, 100%, 0%) black | — |

### New User Defaults

New users see **Preset 1** (black on peach). Two places set this:

1. **React defaults**: `ThemeContext.tsx` uses `DEFAULT_PRESETS[0]` for initial state
2. **HTML fallbacks**: `index.html` has hardcoded values for pre-React page load (prevents flash)

When changing the default preset, update BOTH locations.

### Error Screen

The error boundary (`src/shared/components/ErrorBoundary.tsx`) uses hardcoded DEFAULT_PRESET_1 colors:
- Text: `hsl(215, 100%, 0%)` - black
- Background: `hsl(28, 100%, 83%)` - peach

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
| Cmd+Z / Ctrl+Z | Undo last preset deletion |

#### Preset Deletion Undo (multi-level, v2.3.29+)

Multi-level undo for preset deletion. A `deletedPresetsStackRef` (array) in `PresetGrid.tsx` stores all deleted presets' data (colors, array index, type). Each Cmd+Z / Ctrl+Z pops the most recent deletion and splices it back at its original index.

| Scenario | Behavior |
|----------|----------|
| Delete 3, then Cmd+Z 3 times | All three restored in reverse order |
| Close settings, reopen, Cmd+Z | No undo (ref cleared on unmount) |
| Cmd+Z with nothing deleted | No-op |
| Cmd+Z while typing in editor | Browser native undo (handler skips input/textarea/contentEditable) |

**No conflict with editor Cmd+Z:** The handler runs in capture phase but has an early return for input/textarea/contentEditable elements, so editor undo works normally.

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

**Settings protection:** When settings is open (whether just settings, powerstat, or powerscramble), Space/Enter/Backspace must NOT trigger this auto-focus. These keys are reserved for preset controls. This is handled in `App.tsx`:

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

## Font Sizes

| Name | Size | Class | Elements |
|------|------|-------|----------|
| **title** | 24px | `text-2xl font-extrabold` | "good days" title, lock screen corners |
| **heading** | 18px | `text-lg font-extrabold` | Date header ("jan 30, 2025") |
| **body** | 16px | `text-base font-bold` | Editor text, placeholder, about panel |
| **label** | 14px | inline `fontSize: '14px'` | Sidebar buttons, entry dates, footer, "started at" |
| **caption** | 12px | `text-xs font-bold` | Stats, settings controls, password inputs, presets |

### "started at" Time Display (v2.1.29+)

The entry header shows "started at HH:MM" by default. Seconds are only shown when the powerstats menu is open (`stacked` prop = `showDebugMenu && showAboutPanel`), displaying "started at HH:MM:SS". Works in both 12-hour and 24-hour formats.

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
4. **Narrow mode** → existing linear behavior (zen → panels → sidebar → lock)
5. **Wide mode** → bounce cycle (see below)

**ESC flow in narrow mode (unchanged):**
```
Zen → ESC → (previous state)
Panels open → ESC → Panels closed
Default → ESC → Sidebar Visible
Sidebar Visible → ESC → Lock
```

**ESC bounce cycle in wide mode (v2.4.22+):**

A direction ref (`'up' | 'down'`, default `'up'`) controls the bounce. Non-ESC layout interactions (header click, footer click, sidebar click) reset direction to `'up'`.

```
ESC press (wide mode):
  [panels open]        → closePanels + exit zen/mz → base, dir=up
  [zen]                → zenMode=false, minizen=true, dir=down
  [mz + up]            → zenMode=true, dir=down
  [mz + down]          → minizen=false (dir stays down)
  [base + down + pw]   → save + lock
  [base + down + !pw]  → minizen=true, dir=up (restart)
  [base + up]          → minizen=true (dir stays up)
```

**Wide mode uses raw setters** (`setZenMode`/`setMinizen`) instead of `enterZen`/`exitZen` to bypass `preFocusState` restoration. `preFocusState` and `zenFromMinizen` are cleared on panels→base and zen→mz transitions.

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

**ESC = bounce through layout states (wide mode)**

In wide mode, ESC cycles through base ↔ minizen ↔ zen in a bounce pattern. The direction flips at zen and at base, creating an oscillation. Panels close first (any state → base). At base with password, ESC locks. Without password, it restarts the cycle.

**Example flows (wide mode, with password):**
```
base(↑) → ESC → mz(↑) → ESC → zen(↓) → ESC → mz(↓) → ESC → base(↓) → ESC → 🔒 LOCK

zen(any) → ESC → mz(↓) → ESC → base(↓) → ESC → 🔒 LOCK

panels open → ESC → base(↑) → ESC → mz(↑) → ESC → zen(↓) → ...
```

**Example flow (wide mode, no password):**
```
base(↑) → ESC → mz(↑) → ESC → zen(↓) → ESC → mz(↓) → ESC → base(↓) → ESC → mz(↑) → ... (loops)
```

**Narrow mode** keeps the old linear ESC: zen → panels → sidebar → lock.

**Direction resets:** Any non-ESC layout interaction (header click, footer click, sidebar click) resets direction to `'up'`, ensuring the next ESC from base goes up toward mz/zen.

### Ref Pattern for Layout State in ESC Handler

The ESC handler uses refs to track `zenMode` and `minizen` to avoid stale closure issues:

```tsx
// Refs in useLayoutState.ts (always current)
const zenModeRef = useRef(zenMode);
useEffect(() => { zenModeRef.current = zenMode; }, [zenMode]);
const minizenRef = useRef(minizen);
useEffect(() => { minizenRef.current = minizen; }, [minizen]);

// Direction ref in App.tsx (persists across renders)
const escDirectionRef = useRef<'up' | 'down'>('up');
```

This pattern ensures the handler always sees the current values without re-registering on every state change.

### When ESC Should NOT Lock

1. **Password flow is active** - `showInput && !isSaving` in PasswordSettings
2. **ESC was already handled** - Check `e.defaultPrevented`
3. **Scramble is active** - Unscramble instead (v2.4.18+)
4. **User in `<input>`** - Only blocks `<input>` elements, NOT the editor `<textarea>`
5. **Narrow + any non-base state** - Zen, panels, sidebar hidden all handled before lock
6. **Wide + any non-base state** - Bounce cycle handles zen, mz, panels
7. **Wide + base + no password** - Restarts cycle instead of locking
8. **Wide + base + dir=up** - Enters minizen instead of locking

### When ESC SHOULD Lock

1. **Wide + base + dir=down + hasPassword** - Bottom of bounce cycle, save + lock
2. **Narrow + sidebar visible** - No panels open, no zen
3. **After password saved** - Label says "esc to lock", `isSaving=true`

**Pre-lock save (v2.4.21+):** Before locking, the ESC handler saves the editor content via `saveEntry()` — but **only if `auth.hasPassword` is true**. Without this guard, ESC on a fresh journal (no password) would persist the empty today placeholder to IndexedDB, creating a ghost sidebar entry. The save is only needed to flush pending content before the lock screen appears.

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

## App Icons

**One icon, one shape, everywhere.** All icons use the same rounded design from `icon.svg`. No platform-specific workarounds.

### Icon Files

| File | Size | Purpose |
|------|------|---------|
| `icon.svg` | 1024x1024 | Master source — favicon, all PNGs generated from this |
| `apple-touch-icon.png` | 1024x1024 | iOS/macOS home screen & dock |
| `icon-192.png` | 192x192 | PWA manifest (Android) |
| `icon-512.png` | 512x512 | PWA manifest (Android) |
| `icon-1024.png` | 1024x1024 | PWA manifest (max quality) |
| `og-image.png` | 1200x630 | Social sharing (iMessage, Twitter, etc.) |
| `og-source.svg` | 1200x630 | Source SVG for og-image.png |

**og:image URL:** Must be an **absolute URL** (`https://gdays.day/og-image.png`) in `index.html`. Social crawlers require absolute URLs.

### Icon Design

Black rounded rect (rx=229) with green square centered inside. All icons are this same rounded shape — no square variants.

| Element | Color | HEX |
|---------|-------|-----|
| Inner square | Green | `#1FFF0F` |
| Border/background | Black | `#000000` |

### Generating Icons

All PNGs are generated from the single `icon.svg` with `-b black` to fill the entire canvas (no transparency — ensures full-size icons on macOS/iOS dock):

```bash
cd public
rsvg-convert icon.svg -w 1024 -h 1024 -b black -o apple-touch-icon.png
rsvg-convert icon.svg -w 192 -h 192 -b black -o icon-192.png
rsvg-convert icon.svg -w 512 -h 512 -b black -o icon-512.png
rsvg-convert icon.svg -w 1024 -h 1024 -b black -o icon-1024.png
rsvg-convert og-source.svg -w 1200 -h 630 -o og-image.png
```

### Manifest Config (vite.config.ts)

- `background_color: '#000000'`
- `purpose: 'any'` — NOT `maskable`
- apple-touch-icon is linked in HTML separately, not in manifest

### Backup

Old icons backed up at `public/icon-backup/`.

## Easter Eggs

The app has 8 discoverable easter eggs + 1 secret final egg. The count displays in powerstat mode.

### Easter Egg List

| # | ID | How to Trigger |
|---|-----|----------------|
| 1 | `scrambleTyping` | Type while in scramble mode |
| 2 | `powerstatMode` | Open settings + about panels together |
| 3 | `superscramble` | Settings + about + scramble all active |
| 4 | `liveControl` | Phone pairs with laptop via live sync (WebSyncBridge) |
| 5 | `zenMode` | Enter zen mode (click footer) |
| 6 | `timeCommand` | Use `\time` in the editor |
| 7 | `spacebarRand` | Press spacebar while on rand button in preset grid |
| 8 | `selectColorText` | Click copy or paste in the color stats widget |
| SECRET | `clickedEggCounter` | Click on "7.5/8" to complete (see below) |

### The 7.5/8 Gag

When the user finds all 8 regular eggs, the counter shows **"7.5/8 easter eggs"** instead of "8/8". The final egg is clicking on this incomplete counter:

1. User finds all 8 regular eggs → shows "7.5/8"
2. User clicks "7.5/8" → marks secret egg + rainbow animation + bold sweep animation
3. Counter now shows "8/8"

**The gag**: The 8th egg IS clicking on the counter. You can't complete the collection without clicking it.

After completing, clicking "8/8" replays both animations. Click anywhere or press any key to stop.

### Easter Egg Click Animation

When clicking "8/8 easter eggs", two animations play simultaneously:

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
| `src/features/statistics/components/StatsDisplay.tsx` | Display logic, 7.5 gag, rainbow animation |

### Implementation Notes

- `getEasterEggCount()` returns `total: 8` (hides the secret 9th egg)
- `getFound()` filters stored eggs against `EASTER_EGGS` to ignore stale entries from older versions (v2.1.24 fix — old removed eggs in localStorage were inflating the count past 8)
- `isEasterEggFound('clickedEggCounter')` checks if secret is found
- Display shows "7.5" when `found === total && !hasSecretEgg`
- Rainbow mode: hue cycles 360° in 5 seconds, stops on click/keypress. Dismiss handler does NOT call `stopPropagation`/`preventDefault` (v2.3.19) — the dismissing keystroke flows through to the auto-type handler so the character isn't lost

## Versioning

**CRITICAL**: EVERY push to main MUST increment the version number. No exceptions. This allows the user to verify they're seeing the latest deployed build.

The version number is stored in `src/shared/version.ts` as `export const VERSION = 'x.y.z'` (imported by both `App.tsx` and `main.tsx`).

When pushing changes:
1. **ALWAYS increment the version number** in `src/shared/version.ts` before pushing (MobileApp imports this automatically)
   - Patch (x.y.Z): Bug fixes, small tweaks, any change at all
   - Minor (x.Y.0): New features, non-breaking changes
   - Major (X.0.0): Breaking changes, major rewrites
2. **Tell the user the version number** after pushing (e.g., "Pushed **v1.0.1**")
3. Use the version in the commit message (e.g., "v1.0.1: Fix editor focus issue")

The version displays by hovering over the "good days" title in the sidebar header (the rectangle between the two 6px panel lines). On hover, the title always shows `good days v{VERSION}` (v2.4.17+). Without hover, the title shows the 3-digit pairing code if a phone is actively looking for it, otherwise "good days". Works in both normal and superscramble modes.

**Implementation:** Uses coordinate-based hover detection (`mousemove` + `mouseover` + `getBoundingClientRect`) via a ref on the title div. This bypasses the z-50 overlay that sits on top for minizen click handling — hover and click are fully independent. No `onMouseEnter`/`onMouseLeave` (those would be blocked by the overlay). The `mouseover` listener (v2.3.3+) helps show the version immediately after page refresh when the cursor is already over the title — `mouseover` fires when new content renders under a stationary cursor, while `mousemove` only fires on actual movement.

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

There is no loading screen (v2.2.8+). The app renders the main UI immediately with empty entries; content pops in once `initJournalStorage()` completes. The `useJournalEntries` hook exposes `isLoading` which is `true` until init completes, but no gate blocks rendering.

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

**About panel copy (v2.3.41+)**:
> "Safari is the only major browser with inactivity deletion (7 days); however, if you manually delete site data in browser settings, you'll clear the journal."

**Chrome/Firefox/Edge**:
- Only delete data under storage pressure (low disk space)
- No time-based deletion
- Effectively permanent storage

### What Stays in localStorage

Small settings that benefit from synchronous access:

| Category | Keys |
|----------|------|
| Theme | `colorHue`, `bgHue`, `saturation`, `lightness`, `bgSaturation`, `bgLightness` |
| UI state | `showSettings`, `showAbout`, `showSidebarInNarrow`, `isScrambled`, `scrambleHotkeyActive`, `preFocusState` |
| Auth | `passwordHash` |
| Statistics | `totalKeystrokes`, `totalSecondsOnApp`, `totalLogins` |
| Easter eggs | `easterEggs` |
| Scroll positions | `settingsScrollTop`, `aboutScrollTop`, `scrollPosition:*` |
| Presets | `customPresets`, `selectedPreset`, `selectedCustomPreset` |
| Other | `selectedDate`, `lastTypedTime` |

### At-Rest localStorage Encryption (v2.2.0+)

All values written through the `getItem`/`setItem` abstraction (`src/shared/storage/index.ts`) are encrypted at rest using a synchronous XOR cipher with a static app key. This is the same security philosophy as backup encryption — obfuscation that prevents casual reading of localStorage in DevTools. Anyone with source code access could decrypt.

**How it works:**
- `setItem` encrypts the value with a `$e:` prefix before writing to localStorage
- `getItem` detects the prefix and decrypts; unencrypted values (pre-v2.2.0) are returned raw
- Migration is seamless: old unencrypted values read fine, and encrypt on next write

**Encrypted keys:** All keys that go through `getItem`/`setItem` — theme colors, presets, password hash/salt, statistics, UI state, scroll positions.

**Not encrypted (bypass the abstraction):**
- `gdays_actionLog` (debug logger, `src/shared/logger.ts`)
- `wsDeviceId`, `wsSecret`, `wsPartnerDeviceId` (sync infrastructure, `useWebSync.ts`/`useMobileSync.ts`)
- `easterEggsFound` (easter eggs, `src/shared/utils/easterEggs.ts`)

**index.html IIFE:** Includes an inline `dec()` function mirroring the decrypt logic so pre-React background color reads (`bgHue`, `bgSaturation`, `bgLightness`) work with encrypted values.

**Code location:** `src/shared/storage/index.ts` (encrypt/decrypt functions), `index.html` (inline decrypt for pre-React reads).

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

The `__resettingApp` flag is checked in both `useJournalEntries.ts` and `useStatistics.ts`:

```tsx
// useJournalEntries.ts - beforeunload handler
if ((window as { __resettingApp?: boolean }).__resettingApp) return;  // Skip save during reset

// useStatistics.ts - guards all three save paths:
// 1. setItem effect for totalKeystrokes
// 2. setItem effect for totalSecondsOnApp
// 3. setInterval tick (prevents stale baseSecondsRef from updating state)
// 4. beforeunload handler
if ((window as { __resettingApp?: boolean }).__resettingApp) return;
```

**Why this matters:** Without the flag, the beforeunload handler would save entries to localStorage immediately before reload, then `initJournalStorage()` would find them and migrate them back to IndexedDB on the fresh load. Similarly, the statistics hook's interval and save effects would re-persist the old `totalSecondsOnApp` and `totalKeystrokes` values to localStorage after `clear()` but before reload.

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

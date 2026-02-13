# Claude Code Instructions — Sync

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

**After (zero renders during streaming, v2.4.85+):**
1. `ws.onmessage` → `onColorUpdate` callback buffers latest colors in `pendingColorsRef`
2. `useWebSync` skips setState for ongoing color-updates (only updates on initial null→value transition)
3. `requestAnimationFrame` callback reads buffered colors → sets CSS vars directly on `document.documentElement` → **zero React re-renders**
4. On stream-stop: syncs final colors from `pendingColorsRef` to React state via `applyLivePreset`
5. On disconnect: syncs final colors via individual setters (not `applyLivePreset` to avoid setting `livePreset` back to non-null)

**CSS-only streaming (v2.4.85+):** The rAF callback sets CSS custom properties directly (`--h`, `--s`, `--l`, `--bh`, `--bs`, `--bl`) instead of calling `applyLivePreset`. This bypasses the entire React re-render cascade: `applyLivePreset` triggered 7 state changes → ThemeProvider re-render → unmemoized `value` object → ALL `useTheme()` consumers (30-50+ components) re-rendered every frame → overwhelmed the 16ms frame budget after ~500ms → complete freeze. With CSS-only streaming, the page visuals update via CSS vars (all inline styles use `hsl(var(--h), ...)` static strings), and React is not involved at all during streaming.

**`applyLivePreset` (v2.4.29+):** Combined method on ThemeContext that sets `livePreset` + all 6 color values in a single synchronous block. Still used for stream-stop sync (single render to flush final colors to React state), pairing, and local desktop drag. During local desktop drag, rAF falls back to `setLivePreset` only (skips color apply to prevent flicker).

### Stream Transition Cascade Reduction (v2.4.92+)

Stream transitions (finger lift/touch) previously caused 2-4 full cascade renders through all 15+ `useTheme()` consumers, blocking the main thread for ~320-400ms per lift-touch cycle. Two fixes halve this:

**Fix 1: Eliminate duplicate cascade on stream-stop.** `WebSyncBridge` now sets `activePresetIndex(saveIndex)` in the same synchronous batch as `applyLivePreset` + `incrementColorPickerDragCount`. When PresetGrid's `colorPickerDragCount` effect fires and calls `setActivePresetIndex(saveIndex)`, React sees the same value (`Object.is` bailout) and skips the re-render. Eliminates 1 full cascade (~80-100ms).

**Fix 2: `streamingControls` moved to module-level ref.** Only ColorPicker needs `streamingControls` for indicator sizing (dotSize/needleHeight based on alpha/beta role). Previously stored in ThemeContext state — every `stream-state` message triggered a full cascade of all consumers. Now stored in `streamingControlsRef` (`src/shared/sync/streamingControlsRef.ts`), written by WebSyncBridge, read by ColorPicker during render. Removed `streamingControls`/`setStreamingControls` from ThemeContext, `LiveSyncState`, and `LiveSyncActions`. ColorPicker picks up the latest controls on its next render (triggered by other context changes on stream-start/stop). Minor tradeoff: indicator sizes won't update mid-stream (e.g., beta finger join) until next stream transition — acceptable since indicator sizing is subtle.

Multiple WS messages arriving within the same animation frame are coalesced — only the latest colors are applied. This caps CSS var updates at the display refresh rate instead of the WS message rate.

The `onColorUpdate` callback fires synchronously from `ws.onmessage` in `useWebSync` but only mutates refs (no setState). A `skipBridgeRef` flag prevents the bridge effect from double-applying. Pairing (null→value), disconnect (value→null), and save-preset still use effect chains (not latency-sensitive).

### Hot-Path Performance Fixes (v2.4.83–v2.4.85)

Nine fixes to reduce per-frame overhead during live streaming and phone picking:

1. **Removed `console.log` on every WS message** (`useWebSync.ts`, v2.4.83): Was logging every `color-update` at ~48fps — 48 object serializations/sec. Other lifecycle logs (connect, close, error) remain.

2. **PresetGrid keyboard effect uses refs** (`PresetGrid.tsx`, v2.4.83): The keyboard navigation `useEffect` previously had `hue, saturation, lightness, bgHue, bgSaturation, bgLightness, livePreset` in its deps. During streaming these change every frame, causing 60x/sec listener teardown+re-add. Now uses `colorsRef` and `livePresetRef` (updated on every render) so the effect only re-runs when presets/settings change.

3. **Phone: skip localStorage during picking** (`MobileApp.tsx`, v2.4.83): The `setItem('mobileColors', ...)` effect now has an `if (editing) return` guard, identical to the desktop's `if (isLiveStreaming) return` pattern. Saves ~60 XOR-encrypted writes/sec during picking. Writes fire when picking ends (`editing` flips null).

4. **Phone: memoize `getStatusColors`** (`MobileApp.tsx`, v2.4.83): The WCAG binary search (~80 iterations) was running on every render. Now wrapped in `useMemo` keyed on the 6 color values. Only recalculates when colors actually change (not on tilt re-renders).

5. **Desktop: memoize `getStatusColors` in 4 components** (v2.4.84): `AboutPanel.tsx`, `PasswordSettings.tsx`, `ExportButtons.tsx`, and `StatsDisplay.tsx` each called `getStatusColors()` unmemoized — running ~80-iteration WCAG binary search on every render. During 60fps streaming with poweruser mode open, that's 4 × 80 = 320 binary search iterations per frame. All 4 now wrapped in `useMemo` keyed on `[hue, saturation, lightness, bgHue, bgSaturation, bgLightness]`.

6. **Removed `console.log` on every phone WS message** (`useMobileSync.ts`, v2.4.84): Was logging `msg.type` + full message object on every received message. Removed to match the desktop fix in #1.

7. **CSS-only streaming — zero React re-renders** (`WebSyncBridge.tsx`, v2.4.85+v2.4.86): The fundamental fix. The rAF callback now sets CSS vars directly on `document.documentElement` instead of calling `applyLivePreset` (which set 7 React states → ThemeProvider re-render → unmemoized context `value` object → 30-50+ `useTheme()` consumer re-renders per frame). During streaming, React is completely uninvolved — all visual updates flow through CSS custom properties. React state syncs once on stream-stop (via `applyLivePreset`) and on disconnect (via individual setters to avoid re-setting `livePreset` to non-null). v2.4.86 added 6 position CSS vars (`--th-p`, `--ts-p`, `--tl-p`, `--bh-p`, `--bs-p`, `--bl-p`) so ColorPicker indicators (SL dot, hue needle) also move via CSS during streaming.

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

### Phone Visibility Disconnect (v2.1.4+, updated v2.4.91)

The phone immediately closes its WebSocket when the page goes hidden (home screen, app switcher, tab switch, lock screen). When the page becomes visible again, it reconnects immediately. This makes the desktop exit live mode within ~300ms of the user leaving the phone app (relay latency + 200ms grace), and re-enter live mode as soon as they come back.

**Implementation:** `visibilitychange` listener in `useMobileSync.ts`:
- `hidden` → send `going-hidden` message (v2.4.91+), set `hiddenRef=true`, close WS, clear streaming state, cancel reconnect timer, reset backoff
- `visible` → set `hiddenRef=false`, reset backoff, call `connect()` immediately

**going-hidden message (v2.4.91+):** Before calling `ws.close()`, the phone sends `{ type: 'going-hidden' }` via `ws.send()`. This is critical for iOS lock screen: `ws.close()` initiates a close handshake that requires a round-trip (send close frame → receive close frame), but iOS freezes the page before the handshake completes. The relay never sees the close and must rely on the 30-60s ping/pong timeout to detect the dead connection. In contrast, `ws.send()` data frames are buffered synchronously by the browser into the OS network buffer — the OS sends them even after JS is frozen. The relay handles `going-hidden` as an immediate disconnect (`handleDisconnect` + `ws.terminate()`), so the laptop exits live mode in ~200ms instead of 30-60s.

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

**Phone synchronous re-pair (v2.4.27+):** Mirrors the laptop dedup logic for phones. The relay tracks `phoneConnections: Map<deviceId, clientId>`. When a phone reconnects with the same `deviceId`, the relay closes the old connection and re-pairs the new phone with the same laptop synchronously (inline in `handleRegister`). This preserves pairings across phone reconnects — the phone doesn't flash to the pairing screen when backgrounding and returning.

Code: `deviceConnections` Map + `phoneConnections` Map in `relay.ts`, `dormantRef` + `handleVisibility` in `useWebSync.ts`.

### Pairing Logic Framework (v2.4.14+, updated v2.4.27)

**Same wifi = matched automatically. Different wifi = 3-digit code.** Everything else is resolving edge cases within those two buckets.

#### Same Wifi

- **1 laptop, 1 phone → auto-pair.** Phone opens, finds laptop on same network, paired instantly. No screen, no interaction.
- **2+ laptops, 1 phone → "enter your desktop code."** Phone shows the code entry screen (same as different-wifi). If one laptop disconnects and only 1 remains → auto-pairs automatically (process of elimination). If ALL disconnect → stays on code entry.
- **1 laptop, 2+ phones → last phone wins.** New phone evicts the old phone from the laptop. Physical phone in hand always wins over a stale session.

#### Different Wifi

- **Phone can't find any laptops on its network → 3-digit code.** Phone shows "enter your desktop code." Laptop always shows its code embedded in the title on hover: `g${code[0]}${code[1]}d d${code[2]}ys v${VERSION}`. Code is stable per device (derived from `deviceId`), set on `registered`, never cleared.

#### Disconnection / Reconnection

- **Phone backgrounds → desktop exits live mode (~300ms).** Phone comes back → reconnects → same pairing logic runs fresh.
- **Phone reconnects (same device) → synchronous re-pair (v2.4.27+).** Mirrors laptop same-device dedup: relay tracks `phoneConnections: Map<deviceId, clientId>`. When a phone reconnects with the same `deviceId`, the relay supersedes the old connection and re-pairs with the same laptop atomically. Preserves pairings across phone reconnects (e.g., backgrounding and returning).
- **Laptop closes/refreshes → 3s grace period.** Relay holds the phone's pairing. Laptop returns within 3s → seamlessly re-paired, phone never notices. After 3s → phone re-evaluates (auto-pair if 1 laptop, code entry if 2+ or 0).
- **Laptop tab switch (same browser) → instant handoff.** New tab supersedes old tab atomically. Phone re-paired with new tab, stream state replayed. Old tab goes dormant. Switch back → reclaims connection, same atomic handoff.

#### Skip Bypass (v2.4.20+, was "Don't Connect")

On the code entry screen, "skip" closes the WebSocket and enters standalone mode. Background + foreground clears the skip and reconnects fresh. Only appears when code entry is shown (2+ laptops or 0 on same wifi). Auto-pair (1 laptop) happens before any screen is shown.

### Pairing Code Fallback (v2.4.0+, updated v2.4.27)

When phone and desktop are on different networks (different IPs), or 2+ laptops share the same IP, IP-based auto-pair can't work. Each desktop is assigned a 3-digit pairing code on registration, derived from `deviceId` (v2.4.24+, was `clientId` in v2.4.14): `parseInt(deviceId.slice(0,6), 16) % 1000`, zero-padded. If taken, increments+wraps until free. Since `deviceId` persists in localStorage, the same browser always gets the same code regardless of reconnections, tab switches, or page refreshes. Falls back to `clientId` if `deviceId` is unavailable.

**Pairing code is always in state (v2.4.27+).** Set directly on `registered`, never cleared — persists across pair/unpair cycles and dormant state. No reactive visibility system. The `code-visible` broadcast, `phonesInCodeEntry` Set, `phoneEnterCodeEntry()`, `phoneLeaveCodeEntry()`, `broadcastCodeVisibility()`, and `pairingCodeRef` were all removed.

**Desktop title hover (v2.4.27+):** Title hover always shows the code embedded in the version string: `` g${code[0]}${code[1]}d d${code[2]}ys v${VERSION} ``. No reactive display changes — the code doesn't appear/disappear based on phone activity. Privacy: no UI changes when another user tries to pair. Without hover, title always shows "good days".

**Phone enters code-entry when:**
- 0 unpaired laptops on same IP during registration
- 2+ unpaired laptops on same IP (v2.4.27+, was candidates screen)
- 0 unpaired laptops after eviction re-check
- 0 unpaired laptops after grace timer expiration
- `enter-code` sent from `notifyWatchingPhones`

**Phone leaves code-entry when:**
- Successfully paired (via `pairClients`)
- Phone disconnects (cleanup in `handleDisconnect`)
- 1 unpaired laptop remains (auto-pair via process of elimination)

**Phone:** When 0 or 2+ desktops found on same IP, relay sends `{ type: 'enter-code' }`. Phone shows centered "enter your desktop code" with a 3-digit numeric input (48px monospace, autoFocus, auto-submits on 3 digits). iOS keyboard pushes the title off screen naturally (no viewport hacks). On submit, sends `{ type: 'pair-by-code', code }` to relay. Relay looks up the code in `pairingCodes` Map and pairs.

**Relay error handling (v2.4.8+):** `handlePairByCode` now logs all exit paths (code not found, laptop disconnected, laptop already paired) and sends `enter-code` back to the phone on failure. This gives the phone a signal that the attempt failed (the enter-code re-receipt is harmless if already in that state).

**Code lifecycle:** Assigned on laptop register (stable per device since derived from `deviceId`, v2.4.24+), stored in `pairingCodes: Map<code, clientId>`. Released on disconnect via `releasePairingCode()`. Same `deviceId` on reconnect gets the same code (old code released first, then reassigned).

Code: `assignPairingCode()`, `pairingCodes` Map in `relay.ts`. Pairing code in `useWebSync` state, bridged through `ThemeContext` → `App.tsx` title.

### IP-Based Pairing (v2.4.0+, simplified from v2.1.x)

The pairing hierarchy was simplified from 3-tier (secret → affinity → IP) to IP-only with code fallback:

| Desktops on IP | Phone behavior |
|---|---|
| 1 unpaired | Auto-pair silently |
| 2+ unpaired | Show code entry screen (v2.4.27+, was candidates picker) |
| 0 | Show code entry screen |

**Removed:** `secret` field, `partnerDeviceId` field, `findAffinityMatch()`, `pickBestLaptop()`, `claim-laptop` message, `candidate-update` message, `no-candidates` message, `candidates` message (v2.4.27+), `buildCandidatesList()` (v2.4.27+). Clients no longer store `wsSecret` or `wsPartnerDeviceId` in localStorage.

**Kept:** Phone takeover (evict stale phone when new phone connects and all laptops are taken). `notifyWatchingPhones(ip)` re-evaluates all unpaired phones when IP group changes.

**Grace period guard (v2.4.27+):** `notifyWatchingPhones` skips phones that have an active handoff timer (their paired laptop just disconnected and might come back within the 3s grace period). Prevents premature re-evaluation that would send the phone to code entry while the laptop is refreshing.

**Auto-pair on laptop drop (v2.4.14+):** When an unpaired laptop disconnects, `notifyWatchingPhones` is called for its IP group. If a phone was on code entry (2+ laptops) and now only 1 laptop remains, the phone auto-pairs. If 0 remain, the phone stays on code entry. This makes the hierarchy reactive: process of elimination resolves to auto-pair.

### Relay Handoff Grace Period (v2.1.15+, updated v2.4.0)

When a paired laptop disconnects, the relay delays unpairing the phone by `HANDOFF_GRACE_MS` (3000ms). This prevents the phone from flashing back to the pairing screen during page refreshes or tab switches.

**How it works:**
1. Laptop disconnects → relay starts 3s timer, clears phone's `partnerId` but does NOT send `unpaired`
2. Same-device dedup handles tab switches atomically (new tab re-pairs phone before old tab's disconnect even fires)
3. Timer expires with no new laptop → sends `unpaired` to phone, re-evaluates (auto-pair if 1 desktop, enter-code if 2+ or 0)

**Stream state replay:** When a new laptop pairs during grace, `replayStreamToLaptop()` sends `stream-start` + `stream-state` + `color-update` so the new laptop picks up seamlessly. Snapshots stored on phone's `ClientRecord`: `lastColors`, `lastStreamSide`, `lastStreamState`.

Code: `handoffTimers` map + `replayStreamToLaptop()` in `relay.ts`.

### Candidates Picker (removed in v2.4.27)

The candidates picker ("which one is yours?") was removed. When 2+ unpaired laptops share the same IP, the relay now sends `enter-code` instead of `candidates`. The phone shows the code entry screen in all ambiguous cases. This simplifies the pairing UX to two paths: auto-pair (1 laptop) or code entry (everything else).

**Removed:** `candidates` message type from protocol, `buildCandidatesList()` from relay, candidates UI from `MobileApp.tsx`, `?mock=pairing` mock screen.

### Code Entry Screen (v2.4.0+, updated v2.4.27)

Shown when 0 or 2+ desktops on same IP (v2.4.27+, previously only 0):
- Header: "enter your desktop code" (centered, 20px monospace bold)
- 3-digit numeric input (48px monospace, 4px themed border, autoFocus, auto-submits on 3 digits)
- Input inside `9ch` responsive container at `fontSize: 'min(17vw, 70px)'`
- Input and label vertically centered in space below title (`flex: 1` + `justifyContent: center`)
- iOS keyboard naturally pushes "good days" title off screen (accepted behavior)
- Sends `pair-by-code` to relay, which looks up code in `pairingCodes` Map

**Code rejection UX (v2.4.20+, updated v2.4.27):**
- Cursor hidden after 3 digits (`caretColor: transparent` when `codeInput.length >= 3`)
- Caret visibility fix (v2.4.27+): caret is visible while typing (< 3 digits)
- On server rejection: `codeRejectedCount` incremented in `useMobileSync.ts` (detects `enter-code` received while already in `enter-code` state)
- Input clearing is deferred until after the rejection flash completes (v2.4.27+, was instant). This lets the user see which code was rejected before the input resets.
- Border does a triple red flash matching LockScreen pattern: `errorColor` at 0ms → none at 80ms → `errorColor` at 160ms → none at 240ms → `errorColor` at 320ms → none at 400ms
- `errorColor` is dynamic (from `getStatusColors()`), not hardcoded — adapts to current theme colors
- Input stays focused throughout — user can immediately type next attempt
- Typing during flash cancels it (resets `codeFlash` to `'none'`)

Code: code entry screen in `MobileApp.tsx`, `handlePairByCode()` in `relay.ts`, `codeRejectedCount` in `useMobileSync.ts`.

### Skip Button (v2.4.20+, was "Don't Connect" v2.4.12+)

The code entry screen shows a 2px divider line and "skip" button below the main content. Styled as an `aux`-role button (7px padding, 4px border, 12px radius). Same drag-off cancellation pattern as other mobile buttons (`skipEngaged` ref + `isTouchInside`).

**Spacing (v2.4.20+):** The entire input + divider + skip container uses 24px gap.

**Behavior:** Tapping "skip" calls `sync.skipPairing()` which closes the WebSocket, sets `pairingState` to `'standalone'`, and sets `skippedPairingRef = true` to prevent reconnection. The phone goes to standalone mode (home screen, no live sync). If the user backgrounds and returns to the app, `skippedPairingRef` is cleared and the WS reconnects normally.

**Safari keyboard fix (v2.4.56+):** The skip button blurs the code input on `touchStart` before calling `preventDefault`. Without this, `preventDefault` prevents the focused input from blurring, and Safari may fire `touchCancel` instead of `touchEnd` due to the keyboard/focus conflict — silently swallowing the skip action. The `touchCancel` handler also fires `skipPairing()` as a fallback.

**Auto-pair unchanged:** When 1 desktop is on the same wifi, the relay auto-pairs without showing any screen — the "skip" option only appears on the code entry screen (2+ desktops or 0 on same IP).

Code: `skipPairing()` in `useMobileSync.ts`, "skip" button in `MobileApp.tsx`.

### Save-Preset Carries Phone Colors (v2.4.72+, relay fix v2.4.80)

The `save-preset` message now includes the phone's `colors: ColorPayload`. Previously it was a bare signal with no data — the desktop called `saveCustomPreset()` which read its own React state. If the phone's colors diverged from the desktop (e.g., phone picked colors without streaming), the desktop saved the wrong colors.

**Fix:** Phone sends `{ type: 'save-preset', colors }`. Desktop stores `saveColors` in `WebSyncState`. `WebSyncBridge` passes them to `saveCustomPreset(colors)`. `ThemeContext.saveCustomPreset` accepts an optional `ColorPreset` override — uses it when provided (phone save), falls back to desktop state when omitted (desktop PresetGrid save button).

**Relay fix (v2.4.80):** The relay was forwarding `{ type: 'save-preset' }` without the `colors` field — stripping the phone's colors. The desktop received `undefined` for `msg.colors`, so `saveCustomPreset` fell back to the desktop's own React state. Fixed by forwarding `msg.colors` through the relay. Also updated `server/src/types.ts` to add `colors: ColorPayload` to both the `ClientMessage` and `ServerMessage` `save-preset` variants.

**Files changed:** `protocol.ts` (message type), `useMobileSync.ts` (`sendSave` accepts colors), `MobileApp.tsx` (passes `colors`), `useWebSync.ts` (`saveColors` state), `WebSyncBridge.tsx` (passes colors through), `types.ts` + `ThemeContext.tsx` (`saveCustomPreset` optional param), `server/src/relay.ts` (forward colors), `server/src/types.ts` (add colors to save-preset).

### Live Stats (removed in v2.3.12)

The live stats section (hue travel, sl travel, hz, live saves) was removed from the poweruser menu display. The `useLiveStats` hook in `src/features/statistics/hooks/useLiveStats.ts` is now orphaned (not imported anywhere). `phoneSaveCount`, `incrementPhoneSaveCount`, and `colorUpdateCountRef` were removed from ThemeContext since they existed solely for live stats. WebSyncBridge no longer increments `colorUpdateCountRef` or calls `incrementPhoneSaveCount`. The orphaned localStorage keys (`liveHueDistance`, `liveHslDistance`, `liveLiveSaves`) will persist harmlessly in existing users' browsers.

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

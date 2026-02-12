# Claude Code Instructions

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

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS

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

The version displays by hovering over the "good days" title in the sidebar header (the rectangle between the two 6px panel lines). On hover, the title always shows the pairing code embedded in the version: `` g${code[0]}${code[1]}d d${code[2]}ys v${VERSION} `` (v2.4.27+). The code is always present (set on `registered`, never cleared) — no reactive display changes based on phone activity. Without hover, the title always shows "good days". Works in both normal and superscramble modes.

**Implementation:** Uses coordinate-based hover detection (`mousemove` + `mouseover` + `getBoundingClientRect`) via a ref on the title div. This bypasses the z-50 overlay that sits on top for minizen click handling — hover and click are fully independent. No `onMouseEnter`/`onMouseLeave` (those would be blocked by the overlay). The `mouseover` listener (v2.3.3+) helps show the version immediately after page refresh when the cursor is already over the title — `mouseover` fires when new content renders under a stationary cursor, while `mousemove` only fires on actual movement.

This lets the user verify which build is deployed by hovering the title and checking the version.

## Pre-push Hook

A pre-push hook runs `npm run typecheck` before every push to prevent CI failures. This catches TypeScript errors locally before they hit CI.

To install (first time setup):
```bash
./scripts/setup-hooks.sh
```

If a push is blocked, fix the TypeScript errors shown and try again.

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

### Mobile Safari Cache-Bust (v2.4.44+)

An inline `<script>` in `index.html` (before the theme IIFE) guarantees fresh assets on mobile Safari. The desktop 60s polling and `visibilitychange` checks are unreliable on mobile Safari — the browser suspends background tabs, so the SW update cycle never triggers. Pull-to-refresh just serves the stale SW precache.

**How it works:** On every fresh mobile tab open, unregister all service workers and delete all Cache API caches, then `location.reload()`. The second load has no SW to intercept it — browser fetches everything fresh from the network. `main.tsx` then re-registers the SW with current assets. A `sessionStorage` flag (`cache_busted`) prevents reload loops within a session.

**Key details:**
- Inline script (not a separate file) so a stale SW can't serve a stale version of it
- `document.documentElement.style.display = 'none'` hides flash of stale content during reload
- Flag set BEFORE async work to prevent race conditions with the reload
- `sessionStorage` scoped to tab, dies on tab close — "once per visit" behavior
- ~0.5s reload cost once per tab open; SW works normally for rest of session (offline support, fast loads)
- UA regex matches the existing `isMobile` checks in `main.tsx` and `index.html` — keep them in sync

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

The app has 8 discoverable easter eggs + 1 secret final egg. The count displays in poweruser mode.

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

## Action Logger

Lightweight debug logger for diagnosing user-reported issues. Stores a circular buffer of up to 500 events in localStorage (key: `gdays_actionLog`). **Never logs entry content** — only event names and metadata (counts, dates, flags).

**Code location**: `src/shared/logger.ts`

**Events logged**: storage init/save/delete/flush, journal load/date changes/deletions, multi-tab reloads, beforeunload flushes, fallback mode transitions, auth lock/unlock/password, export/import, errors, app load/midnight.

**API**:
- `logAction(event, data?)` — append event to circular buffer
- `exportLogs(appVersion, entryCount)` — human-readable dump with header
- `clearLogs()` — wipe all logs

**Export UI**: "export debug log" button in poweruser mode (Settings panel, same section as reset). Downloads a `.txt` file with app version, entry count, user agent, and timestamped events. Filename: `good days debug log MM-DD-YYYY HHmmss.txt`.

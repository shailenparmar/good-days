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

## Branch Strategy

| Branch | Purpose | Deploys? |
|--------|---------|----------|
| **main** | Web app (gdays.day) | Yes — GitHub Pages on every push |
| **pro** | Desktop app — good days pro (macOS App Store) | No — local builds only |

**Rules:**
- **All web app changes go to main.** Copy fixes, features, bug fixes — everything that affects gdays.day.
- **All desktop work goes to pro.** Desktop-specific code stays off main until the app is ready.
- **Pro rebases on main** periodically to pick up web app improvements. Run `git checkout pro && git rebase main` then `git push --force-with-lease origin pro`.
- **Never merge pro into main.** The desktop app will get its own build pipeline when it's ready for the App Store.

**Why:** The pro branch modifies shared files (`main.tsx`, `journalStorage.ts`, `package.json`) that could affect the live web app. Keeping it on a separate branch eliminates that risk.

## Deployment

Both apps deploy automatically on push to `main`:

- **GitHub Pages**: https://gdays.day (production)
- **Vercel**: https://gdays.vercel.app/ (backup)

## Domain & Hosting

Production hosted on **GitHub Pages** with custom domain (`gdays.day`) managed by **Cloudflare**. See `docs/infrastructure.md` for DNS records, redirect rules, and troubleshooting.

**Changes not appearing?** Check GitHub Actions completed → verify version in about panel → hard refresh (Cmd+Shift+R).

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

**README covers both apps (v2.6.17+):** The README on `main` has the web app copy on top and a "good days pro" section beneath. The pro section is hardcoded in `generate-readme.ts` (not from `aboutCopy.ts`) since the pro branch has its own diverged copy.

**Pro branch about copy:** The `pro` branch has its own `aboutCopy.ts` with desktop-appropriate copy — no browser references, no system section, condensed privacy, and "good days pro" branding throughout. All user-facing "good days" strings on `pro` say "good days pro" (title, exports, filenames, manifest).

**Copyright notice (v2.6.18+, updated v2.6.24):** `aboutCopy.ts` has a `copyright` field (`© 2026 shailen parmar`) rendered at the bottom of the about panel (body font size, replaces the old `signature` field removed in v2.6.21). Also shown on mobile permission screen (16px monospace bold, 85% opacity, absolutely positioned in the 44px bottom padding of the button container — zero layout impact on the pixel-perfect button/bracket alignment). Included in the README via `generate-readme.ts`.

**Inline emphasis (v2.4.17+):** `aboutCopy.ts` supports `*word*` syntax for italic text. `AboutPanel.tsx` has a `renderWithEmphasis()` helper that splits on `*...*` and wraps matches in `<em>`. The scramble function `s()` is applied per-segment so superscramble still works.

**Inline icons (v2.5.6+, updated v2.5.8):** `aboutCopy.ts` supports `[icon:name]` tokens. `renderWithEmphasis()` splits on these first, then handles emphasis within each text segment. Icon map: `settings` → `<Settings>` (gear), `about` → `<Heart>`. Icons render at `w-4 h-4 inline align-middle`. Current usage: `"toggle [icon:settings] and [icon:about] for a poweruser menu."` — icons only, no words. `generate-readme.ts` strips icon tokens with `.replace(/\[icon:\w+\]/g, '')`.

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

### Info Box (v2.4.48+)

The **info box** replaces the title text on hover. When the about panel is open, the behavior **flips**: the info box is the resting state, and hovering reveals "good days" instead. It shows two lines, both at 24px (`text-2xl font-extrabold font-mono`):

```
v2.4.48
pairing code 042
```

- **Top line:** Version number (`v${VERSION}`)
- **Bottom line:** Pairing code — the 3-digit code for phone-to-desktop sync

Without hover, the title shows "good days" as usual. Logic: `showAboutPanel ? !titleHovered : titleHovered`. Works in both normal and superscramble modes.

### Pairing Code

The **pairing code** (formerly "live code", renamed v2.4.96) is a 3-digit number (000–999) used for phone-to-desktop pairing when devices aren't on the same wifi. Derived from the browser's `deviceId` (a UUID persisted in localStorage as `wsDeviceId2`).

**Formula:** `parseInt(deviceId.slice(0,6), 16) % 1000`, zero-padded to 3 digits. Server handles collisions by incrementing until an open slot is found.

**Lifecycle:**
- `null` on page load (shows `---` in info box) → set within sub-second when WebSocket connects and receives `registered` message
- Stable per browser — same `deviceId` always produces the same code
- Different browser/device = different code (new UUID)
- Never cleared during the session — persists across pair/unpair cycles

**Device ID rotation (v2.4.48):** Key changed from `wsDeviceId` → `wsDeviceId2` to rotate all users to fresh pairing codes.

### Title Hover Detection

Uses coordinate-based hover detection (`mousemove` + `mouseover` + `getBoundingClientRect`) via a ref on the title div. This bypasses the z-50 overlay that sits on top for minizen click handling — hover and click are fully independent. No `onMouseEnter`/`onMouseLeave` (those would be blocked by the overlay). The `mouseover` listener (v2.3.3+) helps show the version immediately after page refresh when the cursor is already over the title — `mouseover` fires when new content renders under a stationary cursor, while `mousemove` only fires on actual movement.

**Anti-flicker: max-height approach (v2.4.68+).** Hovering toggles content between 1-line ("good days") and 2-line (version + pairing code), changing the div height. A `titleMaxHeight` ref tracks the tallest height the div has ever been. The hover zone uses fresh `left/right/top` from the live rect but extends the bottom to `rect.top + maxHeight`. Since maxHeight only grows (via `Math.max`), the hover zone never shrinks when content toggles — breaking the feedback loop that causes flicker. Reset on window resize.

## Pre-push Hook

Pre-push hook runs `npm run typecheck`. Fix TypeScript errors if push is blocked. First-time setup: `./scripts/setup-hooks.sh`. See `docs/infrastructure.md` for details.

## Maintenance Mode (v2.3.32+)

A quick-deploy gate that replaces the entire app with a fullscreen message. Used when fixing critical bugs so users don't hit broken state.

**Config file:** `src/shared/maintenance.ts`
- `MAINTENANCE` — boolean flag
- `MESSAGE` — the text shown (e.g. `'[under construction]'`)

**How it works:** `main.tsx` checks the flag before any React code loads. When enabled, it renders a static `innerHTML` screen (peach bg `hsl(28,100%,83%)`, black mono bold text — same style as the ErrorBoundary "something went wrong" screen). No React, no components, no app code runs.

**Workflow:** User says "push [under construction]" (or any bracketed message) → set `MAINTENANCE = true` and `MESSAGE = '[under construction]'` → bump version → push. User says "take it down" → set `MAINTENANCE = false`, `MESSAGE = ''` → push.

## Service Worker & Auto-Update (v2.4.7+)

Manual SW registration in `main.tsx` (`injectRegister: false`). Polls `registration.update()` every 60s. PWA resume check via `visibilitychange` (hidden >3s threshold, independent of WebSocket handlers). Auto-reload via `controllerchange` + `skipWaiting`. Workbox precache with content hashes.

Flow: deploy → browser detects new precache manifest within 60s (or on PWA resume) → installs + activates new SW → page reloads with fresh assets.

### Mobile Safari Cache-Bust (v2.4.44+)

Inline `<script>` in `index.html` unregisters service workers and clears caches on fresh mobile Safari tab opens, then reloads. `sessionStorage` flag (`cache_busted`) prevents loops. Needed because mobile Safari suspends background tabs, so the SW update cycle never triggers.

**IMPORTANT:** Must be an inline script, NOT a separate `.js` file — a stale SW would serve a stale version of it, defeating the purpose. UA regex must match the `isMobile` checks in `main.tsx` and `index.html` — keep them in sync.

## App Icons

Icons generated from `public/icon.svg`. See `docs/infrastructure.md` for icon files, design spec, and generation commands.

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

Circular buffer (500 events max) in localStorage (`gdays_actionLog`). Never logs entry content. Code: `src/shared/logger.ts`. API: `logAction(event, data?)`, `exportLogs(appVersion, entryCount)`, `clearLogs()`. "Export debug log" button in poweruser mode downloads timestamped `.txt` file.

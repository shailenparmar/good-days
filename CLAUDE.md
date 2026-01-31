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

The conflict separator format:

```
[existing content]
---
from Jan 30, 2026, 10:30 AM backup:

[imported content]
```

Code location: `src/features/export/utils/parseBackup.ts`

```typescript
const importLabel = `\n---\nfrom ${importDate.toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})} backup:\n\n`;
```

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
- Borders use 6px solid with theme color at 0.85 opacity
- **NEVER change cursor styles** - no `cursor: pointer` or other cursor changes on clickable elements. Keep the default cursor everywhere.
- **A REFRESH DOES NOT CHANGE WHAT YOU SEE** - All visible UI state must be persisted to localStorage. If the user can see it before refresh, they must see it after refresh. This includes panels, sidebar visibility, zen mode, scramble state, etc.

## Font Sizes

| Size | Elements |
|------|----------|
| **24px** (`text-2xl`) | "good days" title, lock screen corners |
| **18px** (`text-lg`) | Date header ("jan 30, 2025") |
| **16px** (`text-base`) | Editor/draft text, placeholder, about panel text |
| **14px** | "started at" time, word/char count, sidebar buttons (scramble, settings, about), sidebar entry dates |
| **12px** (`text-xs`) | Stats display, settings controls, password inputs, preset grid |

## Layout Modes & Sidebar Visibility

The app has two layout modes with different sidebar behavior.

### State Variables (in App.tsx)

| Variable | Purpose | Persisted | Default |
|----------|---------|-----------|---------|
| `isNarrow` | `true` when window < 711px | No (computed) | — |
| `showSidebarInNarrow` | Show sidebar when narrow | No | `false` |
| `zenMode` | Hide sidebar+header+footer when wide | Yes | `false` |
| `showDebugMenu` | Settings panel open | Yes | `false` |
| `showAboutPanel` | About panel open | Yes | `false` |

### Visual Layout by State

**Wide mode (`isNarrow = false`):**
```
┌─────────────┬──────────────────────┐
│  Sidebar    │  Header (date)       │  ← visible when !zenMode
│  - stats    │──────────────────────│
│  - entries  │                      │
│  - buttons  │  Editor              │
│             │                      │
│             │──────────────────────│
│             │  Footer (word count) │  ← visible when !zenMode
└─────────────┴──────────────────────┘
```

**Wide + Zen mode:**
```
┌────────────────────────────────────┐
│                                    │
│              Editor                │  ← just editor, nothing else
│                                    │
└────────────────────────────────────┘
```

**Narrow mode (`isNarrow = true`):**
```
┌────────────────────────────────────┐
│  Header (date) ← tap to show sidebar
│────────────────────────────────────│
│                                    │
│              Editor                │
│                                    │
│────────────────────────────────────│
│  Footer (word count)               │
└────────────────────────────────────┘
```

### Sidebar Visibility Formula

```tsx
const showSidebar = isNarrow ? showSidebarInNarrow : !zenMode;
```

### Resize Transitions (Edge Cases)

When the window crosses the 711px breakpoint, state resets to prevent broken UI:

#### Wide → Narrow (shrinking window)

| Before State | After State | Why |
|--------------|-------------|-----|
| `zenMode = true` | `zenMode = false` | Zen is wide-only concept |
| `zenMode = false` | `zenMode = false` | No change needed |
| `showDebugMenu = true` | `showDebugMenu = false` | No room for panel |
| `showAboutPanel = true` | `showAboutPanel = false` | No room for panel |
| `showSidebarInNarrow = *` | `showSidebarInNarrow = false` | Start with sidebar hidden |

**Result**: User sees editor + header + footer. Sidebar hidden. Panels closed.

#### Narrow → Wide (expanding window)

| Before State | After State | Why |
|--------------|-------------|-----|
| `showSidebarInNarrow = true` | `showSidebarInNarrow = false` | Reset for next narrow visit |
| `showSidebarInNarrow = false` | `showSidebarInNarrow = false` | No change |
| `zenMode = *` | `zenMode = false` | Show sidebar on return to wide |
| `showDebugMenu = *` | (unchanged) | Keep panel state |
| `showAboutPanel = *` | (unchanged) | Keep panel state |

**Result**: User sees full layout with sidebar. Panels preserved.

### Specific Edge Case Scenarios

| Starting State | User Action | Result |
|----------------|-------------|--------|
| Wide + settings open | Drag to narrow | Settings closes, sidebar hidden |
| Wide + about open | Drag to narrow | About closes, sidebar hidden |
| Wide + both panels open | Drag to narrow | Both close, sidebar hidden |
| Wide + zen mode | Drag to narrow | Zen off, sidebar hidden, header/footer show |
| Narrow + sidebar open | Drag to wide | Sidebar stays (zenMode=false), sidebar visible |
| Narrow + sidebar hidden | Drag to wide | zenMode=false, sidebar visible |

### User Interactions

#### Click Behaviors

| Click Location | Wide Mode | Narrow Mode |
|----------------|-----------|-------------|
| EntryHeader | Toggle zen + close panels | Toggle sidebar visibility |
| Editor area | — | Close panels only |
| Sidebar area | Close panels | Close panels |
| Sidebar overlay | N/A | Close sidebar + panels |
| Entry in list | Close panels | Close panels |
| Typing starts | Close panels (narrow only) | Close panels |

#### ESC Key Behavior

| Current State | ESC Result |
|---------------|------------|
| In input field | Nothing (don't interrupt typing) |
| Password flow active | Back one step (handled by PasswordSettings) |
| Wide + zen mode | Exit zen mode (show sidebar/header/footer) |
| Wide + not zen | Lock app |
| Narrow (any state) | Lock app |

### Panel Opening Behavior

Opening settings or about has special zen interaction:

```tsx
// When opening a panel in wide mode
if (opening) setZenMode(false); // Auto-exit zen so sidebar is visible
```

| Before | User clicks settings/about | Result |
|--------|---------------------------|--------|
| Wide + zen | Open panel | Zen exits, sidebar appears, panel opens |
| Wide + no zen | Open panel | Panel opens in sidebar |
| Narrow + sidebar hidden | Open panel | Sidebar appears, panel opens |
| Narrow + sidebar visible | Open panel | Panel opens in sidebar |

### Code: closePanels()

**ALWAYS use `closePanels()`** - never call setters separately.

```tsx
const closePanels = useCallback(() => {
  setShowDebugMenu(false);
  setShowAboutPanel(false);
}, []);
```

### Code: Resize Handler

```tsx
useEffect(() => {
  const handleResize = () => {
    const narrow = window.innerWidth < COLLAPSE_BREAKPOINT;
    const wasNarrow = isNarrow;
    setIsNarrow(narrow);

    if (narrow !== wasNarrow) {
      if (narrow && !wasNarrow) {
        // Wide → Narrow: close panels (no room)
        closePanels();
      }
      // Both directions: reset sidebar/zen state
      setShowSidebarInNarrow(false);
      setZenMode(false);
    }
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [isNarrow, closePanels]);
```

### Key Principles

1. **Zen is wide-only** - Narrow mode has no zen concept; header/footer always show
2. **Panels need sidebar** - Opening panel auto-exits zen so sidebar is accessible
3. **Going narrow closes panels** - No room in narrow layout for settings/about
4. **Going wide shows sidebar** - Reset zenMode=false so user sees full UI
5. **ESC escapes zen first** - In zen, ESC exits zen instead of locking

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
- [ ] No password, "password" (focused) → ESC → blurs input, shows placeholder
- [ ] No password, "one more time" → ESC → back to "password", blurred
- [ ] No password, wrong confirm → focused at "password" → ESC → blurs, shows placeholder
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

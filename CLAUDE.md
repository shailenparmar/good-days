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

## Project Structure

- `src/features/` - Feature-based modules (auth, journal, theme, settings, statistics, export)
- `src/shared/` - Shared utilities and components
- `src/index.css` - Global styles including scrollbar-hide utility

## UI Conventions

- All scrollable areas should use `scrollbar-hide` class to hide scrollbars
- Theme colors are HSL-based and managed via ThemeContext
- Borders use 6px solid with theme color at 0.85 opacity
- **NEVER change cursor styles** - no `cursor: pointer` or other cursor changes on clickable elements. Keep the default cursor everywhere.
- **A REFRESH DOES NOT CHANGE WHAT YOU SEE** - All visible UI state must be persisted to localStorage. If the user can see it before refresh, they must see it after refresh. This includes panels, sidebar visibility, zen mode, scramble state, etc.

## Layout Modes & Sidebar Visibility

The app has two layout modes with different sidebar behavior.

### State Variables (in App.tsx)

| Variable | Purpose | Persisted |
|----------|---------|-----------|
| `isNarrow` | `true` when window < 711px | No (computed from window width) |
| `showSidebarInNarrow` | Show sidebar when narrow | Yes |
| `zenMode` | Hide sidebar when wide (distraction-free) | Yes |
| `showDebugMenu` | Settings panel visibility | Yes |
| `showAboutPanel` | About panel visibility | Yes |

### Sidebar Visibility Formula

```tsx
(isNarrow ? showSidebarInNarrow : !zenMode)
```

| Mode | Sidebar Shows When |
|------|-------------------|
| Wide | `!zenMode` (default: visible) |
| Narrow | `showSidebarInNarrow` (default: hidden) |

### Mode Transitions

| Transition | Behavior |
|------------|----------|
| Wide → Narrow | `showSidebarInNarrow` stays false (sidebar hidden) |
| Narrow → Wide | `showSidebarInNarrow` reset, `zenMode` reset (sidebar visible) |
| Open settings/about | `zenMode` auto-exits (sidebar appears) |

### Click Behaviors

| Click Location | Wide Mode | Narrow Mode |
|----------------|-----------|-------------|
| EntryHeader | Toggle zen + close panels | Toggle sidebar + close panels |
| Editor area | — | Close panels |
| Sidebar | Close panels | Close panels |
| Sidebar overlay | N/A | Close sidebar + panels |
| Entry selection | Close panels | Close panels |
| Typing | Close panels | Close panels |

### Closing Panels

**ALWAYS use `closePanels()`** - never call setters separately.

```tsx
const closePanels = useCallback(() => {
  setShowDebugMenu(false);
  setShowAboutPanel(false);
}, []);
```

### Key Principles

1. **Explicit state changes** - Sidebar visibility is always controlled by `showSidebarInNarrow` or `zenMode`, never by layout space
2. **Zen mode auto-exits** - Opening settings/about exits zen mode so sidebar is accessible
3. **Mode reset on resize** - Going narrow→wide resets both `showSidebarInNarrow` and `zenMode`
4. **Stop propagation** - EntryHeader click stops propagation to prevent duplicate handler calls

## ESC Key Behavior (IMPORTANT)

ESC key locks the app, but NOT in certain situations. Two handlers coordinate this:

### Handler Architecture

| Handler | Location | Phase | Purpose |
|---------|----------|-------|---------|
| Password flow | `PasswordSettings.tsx` | Capture (runs first) | Reset password flow, call `preventDefault()` |
| App lock | `App.tsx` | Bubble (runs second) | Lock app if not prevented |

### When ESC Should NOT Lock

1. **User is in an input field** - Check `document.activeElement.tagName`
2. **Password flow is active** - `showInput && !isSaving` in PasswordSettings
3. **ESC was already handled** - Check `e.defaultPrevented`

### When ESC SHOULD Lock

1. **Main editor view** - No panels open, not in input
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

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

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS
- Electron (for desktop app in `/electron`)

## Versioning

**IMPORTANT**: This project uses semantic versioning. The version number is stored in `src/App.tsx` as `const VERSION = 'x.y.z'`.

When pushing changes:
1. **Increment the version number** in `src/App.tsx`
   - Patch (x.y.Z): Bug fixes, small tweaks
   - Minor (x.Y.0): New features, non-breaking changes
   - Major (X.0.0): Breaking changes, major rewrites
2. **Tell the user the version number** after pushing (e.g., "Pushed **v1.0.1**")
3. Use the version in the commit message (e.g., "v1.0.1: Fix editor focus issue")

The version displays in the app title ("good days v1.0.1") only when the about panel is open — a subtle, whimsical touch for users who are curious.

This lets the user verify which build is deployed by opening the about panel and checking the version.

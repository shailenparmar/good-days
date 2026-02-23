# Claude Code Instructions — Electron

## Electron Desktop App (Mac App Store)

The app is wrapped in **Electron** to ship on the Mac App Store as "good days pro". Same React codebase, but storage routes through file-based IPC instead of IndexedDB when running in Electron.

### Architecture

```
PWA (web):   React → IndexedDB (browser storage)
Electron:    React → IPC → file system (userData/entries/YYYY-MM-DD.json)
```

Detection: `window.electronAPI?.platform === 'electron'` — exposed by preload script via contextBridge.

## Versioning (IMPORTANT — two version numbers)

The pro branch has **two independent version numbers**:

| Version | File | Purpose | Format |
|---------|------|---------|--------|
| **App version** | `package.json` `"version"` | App Store version. What Apple and users see. | `X.Y.Z` (currently 1.0.2) |
| **Web version** | `src/shared/version.ts` | Shared with main branch. Shown in info box hover. | `X.Y.Z` (tracks main, currently 2.6.x) |

**Rules:**
- **Increment `package.json` version before every App Store submission.** This is the version Apple sees. Must be higher than the last submitted version or Transporter will reject it.
- **Do NOT manually change `version.ts`** on pro — it comes from main via rebase.
- The info box shows `version.ts` (the web version). The App Store shows `package.json` version.

## Build & Submit Workflow

### Prerequisites (already set up)

- Apple Developer account with "Apple Distribution" certificate
- Provisioning profile at `build/embedded.provisionprofile`
- Signing identity: `Shailen Parmar (4Y4K23UP57)`
- Entitlements in `build/` directory
- `electron-builder.yml` config
- Transporter app installed

### Build for App Store

```bash
# 1. Increment version in package.json
# 2. Build signed .pkg
npm run build:mas
# 3. Output at /tmp/good-days-release/mas-arm64/
#    - good days pro.app (signed, can't run directly — MAS sandboxed)
#    - good days pro-X.Y.Z-arm64.pkg (upload this to Transporter)
# 4. Open Transporter, drag in the .pkg, hit Deliver
```

### Dev Testing

```bash
npm run dev:electron
```

Runs Vite + Electron together. Hot-reloads on file changes. The MAS-signed `.app` can NOT be run directly — use dev mode for testing.

### Build Files

| File | Purpose |
|------|---------|
| `electron-builder.yml` | electron-builder config (appId, signing, targets) |
| `build/icon.icns` | App icon |
| `build/embedded.provisionprofile` | Apple provisioning profile |
| `build/entitlements.mas.plist` | MAS sandbox entitlements |
| `build/entitlements.mas.inherit.plist` | Child process entitlements |
| `build/entitlements.mas.loginhelper.plist` | Login helper entitlements |
| `build/afterPack.cjs` | Post-pack cleanup: strips xattrs, ._* files, stale signatures |

### Electron Module System (ES2022)

`package.json` has `"type": "module"`. The electron tsconfig compiles to `ES2022` modules (not CommonJS). This means:
- All local imports need `.js` extensions (`'./storage.js'`, not `'./storage'`)
- `__dirname` is not available — polyfilled via `fileURLToPath(import.meta.url)`
- `afterPack.cjs` uses `.cjs` extension to stay CommonJS (electron-builder requires it)

## Electron Shell

- `main.ts` — BrowserWindow, context isolation, sandbox enabled, `titleBarStyle: 'hiddenInset'`
- `preload.ts` — contextBridge exposes `window.electronAPI` (storage + backup + platform)
- `storage.ts` — IPC handlers: save/load/loadAll/delete entries as JSON files in `userData/entries/`
- `backup.ts` — IPC handlers: native save/open dialogs for backup `.txt` files
- `types.ts` — IPC channel constants
- `tsconfig.json` — Electron-specific TypeScript config (ES2022 module)

## React ↔ Electron Wiring

- `src/shared/types/electron.d.ts` — Ambient type declaration for `window.electronAPI`
- `src/shared/storage/journalStorage.ts` — Every storage function has an `if (isElectron())` early-return branch
- `src/features/export/components/ExportButtons.tsx` — Electron branches for backup (native save dialog) and import (native open dialog)

**Data format over IPC:** `JSON.stringify(encryptedRecord)` — same shape as IndexedDB. Electron stores this string as-is in `userData/entries/YYYY-MM-DD.json`.

## Traffic Light Padding

`titleBarStyle: 'hiddenInset'` puts macOS traffic lights (close/minimize/fullscreen) inside the content area. A `titleBarPad` constant (30px) in `App.tsx` adds top padding to:
- The sidebar header (where "good days pro" title lives)
- The EntryHeader (date/title area in minizen and narrow modes)

This keeps text clear of the traffic lights across all layout states while letting the sidebar's vertical stripe extend to the top edge.

## Pro-Specific Differences from Main

See the **Pro Rebase: Divergent Files** section in the root `CLAUDE.md` for the full table. Key differences:
- All user-facing "good days" → "good days pro"
- `aboutCopy.ts` — condensed privacy, no system section, 3-line closing (closing + signature + copyright)
- `AboutPanel.tsx` — renders 3 bottom lines instead of 2
- `App.tsx` — `titleBarPad` constant, "good days pro" title
- Export filenames and headers say "good days pro"

## Key Design Decisions

- **Intercept at the lowest level:** All Electron branches are in the private storage functions. Higher-level code routes through automatically.
- **Web path untouched:** Every change is behind `isElectron()` — PWA works identically.
- **Metadata in localStorage:** Electron uses `electronEncryptionMode` and `electronPasswordProtected` localStorage keys instead of IndexedDB metadata store.
- **BroadcastChannel:** Harmless no-op in Electron (single window).
- **fallbackMode:** Never triggers in Electron since IndexedDB is never opened.

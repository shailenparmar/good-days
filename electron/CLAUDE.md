# Claude Code Instructions — Electron

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

## Versioning

| Version | File | Purpose |
|---------|------|---------|
| `PRO_VERSION` | `src/shared/proVersion.ts` | App Store + info box version. Bumped before each build/submission. |
| `REBASED_FROM` | `src/shared/proVersion.ts` | Web version pro was last rebased from. Updated automatically after rebase. |
| `VERSION` | `src/shared/version.ts` | Web version from main. Do not edit on pro — comes via rebase. |

**Update rules:**
- `PRO_VERSION` — bumped in build flow (auto)
- `REBASED_FROM` — updated in rebase flow (auto)
- `VERSION` — never touched on pro

## Pro Branch Workflow (MANDATORY)

**When on pro, this workflow overrides the root CLAUDE.md push checklist.** No deploy verification (pro doesn't deploy). No web version bump. Always push immediately after commit.

### 1. Pro Commit Flow

After completing any feature/fix on pro, execute all steps without being asked:

1. Document behavior/UI/architecture changes in `electron/CLAUDE.md`
2. Commit with format: `pro v{PRO_VERSION}: description`
3. `git push origin pro`
4. Tell user: "Committed and pushed — pro v{PRO_VERSION}"

No deploy check. No version.ts bump. Always push immediately.

### 2. Pro Rebase Flow

When user says "rebase":

1. `git rebase main`
2. Resolve conflicts — keep pro's electron deps, pro version, pro branding
3. Variance check: `grep -r "good days pro" src/ index.html` — all 7 files must hit:
   - `aboutCopy.ts`, `AboutPanel.tsx`, `App.tsx`, `ExportButtons.tsx`, `formatEntries.ts`, `SettingsPanel.tsx`, `index.html`
4. Spot-check HIGH-risk files:
   - `aboutCopy.ts` — no `system` section, has `signature` field
   - `AboutPanel.tsx` — 3-line footer (closing + signature + copyright)
5. Verify pro-only files survived: `proVersion.ts` exists, `electron/` directory intact
6. Update `REBASED_FROM` in `src/shared/proVersion.ts` to match current `VERSION`
7. `npm run typecheck` + `npm run typecheck:electron`
8. Commit the `REBASED_FROM` update
9. `git push --force-with-lease origin pro`
10. Tell user: "Rebased on main (web v{VERSION}) — all divergent files verified"

### 3. Pro Build Flow

When user says "build" or "submit":

1. Bump `PRO_VERSION` in `src/shared/proVersion.ts` + `version` in `package.json` (keep in sync)
2. `npm run typecheck` + `npm run typecheck:electron`
3. `npm run build:mas`
4. Verify `.pkg` at `/tmp/good-days-release/mas-arm64/`
5. Commit with format: `pro v{PRO_VERSION}: build for submission`
6. `git push origin pro`
7. Tell user: "Built pro v{PRO_VERSION} — .pkg ready for Transporter"

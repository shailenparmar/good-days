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

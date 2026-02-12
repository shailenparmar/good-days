# Claude Code Instructions — Storage

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

### Migration v1.7.0

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
- `wsDeviceId2`, `wsSecret`, `wsPartnerDeviceId` (sync infrastructure, `useWebSync.ts`/`useMobileSync.ts`)
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

The reset button (poweruser mode) clears both storage systems. The process handles two key issues:

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

### Storage Display (Poweruser Mode)

Shows IndexedDB quota via `navigator.storage.estimate()`:

- Format: `{used} MB / {quota}` (e.g., "0.15 MB / 2.5 GB")
- Large quotas (≥1GB) shown in GB
- Fetched once when poweruser menu opens (not live-updating)
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

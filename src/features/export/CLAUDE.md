# Claude Code Instructions — Export

## Backup & Import

The app supports exporting entries to an **encrypted** `.txt` file and importing them back.

### Backup Format

Backups are encrypted using AES-GCM with an app-embedded key.

**Filename**: `good days backup 02-03-2026 211201.txt` (MM-DD-YYYY HHmmss, zero-padded, always military time, no colon separators because macOS converts them to underscores)

**File contents**: Just the encrypted base64 blob, no header.
```
U2FsdGVkX1+vupppZksvRf8Z7J9K3xH5mN2qW...
[base64 encrypted content]
```

**Decrypted content** (JSON format, v1+):
```json
{
  "version": 1,
  "exportedAt": 1706969445000,
  "entries": [
    {
      "date": "2025-01-27",
      "content": "<div>Entry content here...</div>",
      "title": "Optional title",
      "startedAt": 1706345400000,
      "lastModified": 1706345400000
    }
  ]
}
```

**JSON format advantages:**
- Preserves all entry fields (`title`, `lastModified` were lost in legacy format)
- No regex parsing edge cases
- Version field for future format changes

**Legacy markdown format** (still supported for import):
```
# good days

---

## Monday, January 27, 2025

*Started at 09:30:00*

Entry content here...
```

Import automatically detects format: tries JSON first, falls back to legacy markdown.

### Import Validation

Validation is robust and backward-compatible:

1. **Find base64 content** - Find first line that looks like base64 (50+ chars of `[A-Za-z0-9+/=]`), skipping any header lines from old backups
2. **Decryption validates** - AES-GCM decryption fails on non-backup files (wrong key = error)
3. **JSON structure check** - Valid backup has `version` number and `entries` array
4. **Legacy fallback** - If not JSON, try markdown parser

New backups have no header (just encrypted content). Old backups with headers still import fine.

### Encryption Details (Backups)

- **Algorithm**: AES-GCM (256-bit key)
- **Key derivation**: PBKDF2 with fixed app secret (non-extractable key)
- **IV**: Random 12 bytes per encryption (stored with ciphertext)
- **Salt**: `good-days-salt`
- **Code location**: `src/shared/crypto.ts` (`encryptText`/`decryptText`)

Note: This is obfuscation (prevents casual reading), not security. Anyone with source code access could decrypt backups.

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

### Import Conflict Handling (v2.3.37+)

Entries are treated as **units** (title + content). When importing, entries are **merged** (not replaced). If an imported entry's date already exists:

1. **Exact match** (same content AND same title): Skip
2. **Already appended**: The formatted import block (`--- title content`) is found in the existing text → skip (prevents duplicates on re-import)
3. **Any difference** (content, title, or both): Append the imported entry below existing with a `---` separator. The imported title (if any) is always included after the `---`

### Import `lastModified` Preservation (v1.10.0+)

Imported entries preserve their original `lastModified` timestamp from the backup file. This is important because:
- `lastModified` is meaningful journal metadata (when the entry was actually last edited)
- The merge logic uses `lastModified` to pick winners — fake timestamps would poison it
- Previously, all imported entries got `lastModified: Date.now()`, making old backups appear "newer" than current entries

**Current behavior:**

| Scenario | `lastModified` value |
|----------|---------------------|
| New entry from JSON backup (has `lastModified`) | Original from backup |
| New entry from JSON backup (no `lastModified`) | Import timestamp (fallback) |
| New entry from legacy markdown backup | Import timestamp (format has no `lastModified`) |
| Conflict merge (content appended) | Import timestamp (content genuinely changed) |

Code location: `src/features/export/utils/parseBackup.ts`

The conflict separator is a clean `---`. The imported entry's title (if any) always appears after the separator:

```
[existing content]

---
a very rainy day

[imported content]
```

Without a title:
```
[existing content]

---
[imported content]
```

**Import block duplicate detection (v2.3.37+):** Instead of checking if the existing content *contains* the imported content (which would skip when existing is a superset), we check if the formatted import block (`--- title content`, normalized) already exists in the existing text. This only matches actual previous imports (content after a `---` separator), not organic content. This preserves fearless re-import while treating any actual difference as meaningful.

Code location: `src/features/export/utils/parseBackup.ts`

### Exact Match Handling

When importing, entries with **identical content** are skipped entirely (not merged). The comparison uses whitespace normalization to handle HTML/plaintext differences:

```typescript
// Strip HTML preserving line breaks (</div> and <br> become \n)
function stripHtml(html: string): string {
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n');
  const div = document.createElement('div');
  div.innerHTML = withLineBreaks;
  return div.textContent || '';
}

// Normalize whitespace for comparison (collapse all \s+ to single space)
function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
```

**Why this matters:** HTML `<div>Hello</div><div>World</div>` and plain text `Hello\nWorld` must match. Without line break preservation, `textContent` produces `HelloWorld` (no space), which doesn't match `Hello World` after normalization.

**Comparison flow:**
1. Strip HTML from existing entry (preserving line breaks as `\n`)
2. Normalize both existing and imported text (collapse whitespace)
3. Compare titles (`(existing.title || '') === (imported.title || '')`)
4. Build import block: `--- ${normalizedTitle} ${normalizedContent}`
5. Skip if: empty import, exact match (content + title), or import block found in existing. Otherwise → append.

### Key Behaviors

- **Import only accepts encrypted backups** (files must start with `good days encrypted backup`)
- **Multi-file import** - Select multiple backup files at once, all processed and merged
- Import button is always enabled (can import into empty app)
- New dates from import are added as new entries
- `startedAt` is preserved (uses older timestamp if imported entry is older)
- Entries are re-sorted by date after import
- "Copy to clipboard" still copies plain text (not encrypted)

### Button Text

| Mode | Button | Default Text | On Hover |
|------|--------|--------------|----------|
| Normal | Copy | "copy to clipboard" | — |
| Normal | Backup | "download backup" | — |
| Normal | Import | "import backup" | — |
| Powerstat | Copy | "copy markdown format" | — |
| Powerstat | Backup | "download AES-256-GCM backup" | — |
| Powerstat | Import | "import AES-256-GCM backup" | "multiple files accepted" |

The import button hover text change in powerstat mode is a literal string change (not a tooltip - we don't use tooltips). The Download icon stays visible in both default and hover states (v1.10.24+) — only hidden during feedback (success/error).

### Fearless Import Philosophy

**Import should require zero mental overhead.** Users should be able to select an entire folder of backups - from different dates, different devices, with overlapping content - and just import them all. The app figures it out.

No duplicate content. No corruption. No "did I already import this?" No thinking required.

**Safeguards:**
1. Same date + identical entry (same content + same title) → skip entirely
2. Same date + already appended (import block found in existing) → skip (prevents re-appending)
3. Same date in multiple files → handled (Set tracks what's been added)
4. Multi-file import → all merge cleanly into one result

**Result:** User can import the same backup 10 times, import overlapping backups, import their entire backup folder - it just works.

### Import Feedback

After import, the import button shows feedback:

| State | Text | Color |
|-------|------|-------|
| Success | "X entry/entries imported" | Confirm color (WCAG green) |
| Failure | "import failed" | Error color (WCAG red) |

**Behaviors:**
- No hover shading when feedback is showing
- Dismiss by: **keystroke only** (clicks are intentional actions, not dismissals)
- Uses capture phase event listener to fire before `stopPropagation()` calls

**Status colors:** Uses WCAG-based dynamic colors for guaranteed readability. See **Dynamic Status Colors** section below for full algorithm details.

```typescript
const { confirm: confirmColor, error: errorColor } = getStatusColors(
  hue, saturation, lightness,       // text color HSL
  bgHue, bgSaturation, bgLightness  // background color HSL
);
```

**Count reflects actual changes:**
- Importing same backup twice → "0 entries imported" (nothing changed)
- New entries + modified entries are counted
- Skipped (identical content) entries are not counted
- Multi-file import shows combined total across all files

**Failure handling (v2.1.27+):**
- Bad files (wrong format, decryption failure) are silently ignored during multi-file import
- Only shows "import failed" if ALL selected files fail — no valid file was decrypted and parsed
- If at least one file succeeds (decrypts + parses), shows "X entries imported" and ignores the bad ones
- Uses `anyFileSucceeded` flag set after successful decrypt+parse+merge, not entry count or array length

Code location: `src/features/export/components/ExportButtons.tsx`

### Export Buttons Layout

All three export buttons (copy, download backup, import) live in a single `<div className="space-y-2">` container inside ExportButtons. The parent section in SettingsPanel wraps them in `<div className="p-4">` with a 6px bottom border in stacked mode. **Do NOT wrap individual buttons in their own bordered divs** — this creates unwanted thick panel lines between buttons.

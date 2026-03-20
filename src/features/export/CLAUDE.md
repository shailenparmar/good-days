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

**Decrypted content** (JSON format, v2+):
```json
{
  "version": 2,
  "exportedAt": 1706969445000,
  "entries": [
    {
      "date": "2025-01-27",
      "content": "<div>Entry content here...</div>",
      "title": "Optional title",
      "startedAt": 1706345400000,
      "lastModified": 1706345400000
    }
  ],
  "presets": [{ "hue": 116, "sat": 100, "light": 12, "bgHue": 52, "bgSat": 100, "bgLight": 91 }],
  "customPresets": [{ "hue": 200, "sat": 80, "light": 40, "bgHue": 30, "bgSat": 90, "bgLight": 95 }]
}
```

**JSON format advantages:**
- Preserves all entry fields (`title`, `lastModified` were lost in legacy format)
- No regex parsing edge cases
- Version field for future format changes
- v2 includes color presets (both default and custom) so they round-trip through backup/restore

**v3 format (DEK/KEK, v3.0.0+):**

When DEK/KEK is active, backups use v3 format — a raw JSON file (not outer-encrypted) containing encrypted entry payloads and a wrapped DEK:

```json
{
  "version": 3,
  "exportedAt": 1706969445000,
  "dek": {
    "wrapped": "base64...",
    "protection": "password"
  },
  "encryptedEntries": [
    {
      "date": "2025-01-27",
      "_enc": "dek",
      "_payload": "base64...",
      "startedAt": 1706345400000,
      "lastModified": 1706345400000
    }
  ],
  "presets": [...],
  "customPresets": [...]
}
```

**v3 advantages over v2:**
- **Password-protected backups**: DEK is wrapped with user's password-derived KEK. Only someone with the password can read entries.
- **Fast export**: No decrypt/re-encrypt — entries dumped as-is from IndexedDB.
- **Uses `encryptedEntries` (not `entries`)**: Old app versions that somehow parse v3 JSON won't accidentally create empty entries from the encrypted payloads.

**v3 import flow:**
1. Try to parse file as JSON first
2. If v3 with `dek.protection === 'app'`: unwrap DEK with app KEK, decrypt entries, merge
3. If v3 with `dek.protection === 'password'`: show inline password input, user enters backup password, derive KEK, unwrap DEK, decrypt entries, merge
4. If not v3: fall back to old flow (find base64, decrypt with backup key)

**v3 import password UI:** An inline `<input type="password">` appears below the import button. Placeholder says "backup password" (or "wrong password" after failed attempt). ESC cancels. Wrong password flashes border in error color. Styled like the lock screen input (12px mono bold, 3px border, theme colors).

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

**v3 backups (DEK/KEK, v3.0.0+):**
- **Entry encryption**: AES-256-GCM with random DEK (entries stay encrypted as-is from IndexedDB)
- **DEK wrapping**: AES-256-GCM with KEK (password-derived or app-secret key)
- **No outer encryption**: v3 files are raw JSON — entry content is protected by the DEK
- **Password-protected**: If user has a password, DEK is wrapped with password-derived KEK. Without the password, entries are unreadable.
- **No password**: DEK is wrapped with `APP_SECRET` KEK — same baseline obfuscation as v1/v2.

**v1/v2 backups (legacy, still supported for import):**
- **Algorithm**: AES-GCM (256-bit key)
- **Key derivation**: PBKDF2 with fixed app secret (non-extractable key)
- **IV**: Random 12 bytes per encryption (stored with ciphertext)
- **Salt**: `good-days-salt`
- **Code location**: `src/shared/crypto.ts` (`encryptText`/`decryptText`)
- **Base64 encoding**: `uint8ToBase64()` helper converts encrypted bytes in 8KB chunks. `String.fromCharCode(...array)` exceeds the JS engine's max argument limit (~65K on Chrome) for large journals — chunking eliminates this ceiling.
- Note: v1/v2 is obfuscation (prevents casual reading), not security. Anyone with source code access could decrypt backups.

### At-Rest Encryption

See **At-Rest Encryption** in `src/shared/storage/CLAUDE.md` for encryption architecture, key lifecycle, password transition flows, and API exports.

### Import Conflict Handling (v2.3.37+, updated v2.5.28)

Entries are treated as **units** (title + content). When importing, entries are **merged** (not replaced). If an imported entry's date already exists:

1. **Exact match** (same content AND same title): Skip
2. **Already appended**: `[from backup]` marker found in existing text + title/content match → skip (prevents duplicates on re-import)
3. **Any difference** (content, title, or both): Append the imported entry below existing with a `--- [from backup] ---` separator, plus `started at` time and `title:` metadata if present

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

The conflict separator is `--- [from backup] ---` with started-at time and optional title. Format (v2.5.50+):

```
[existing content]

--- [from backup] ---
started at 5:49 am
title: a very rainy day

[imported content]
```

Without a title:
```
[existing content]

--- [from backup] ---
started at 5:49 am

[imported content]
```

Neither startedAt nor title:
```
[existing content]

--- [from backup] ---

[imported content]
```

**Import block duplicate detection (v2.5.28+):** Uses a split check: `[from backup]` marker must be present in existing text AND imported content must be present AND (for titled entries) `title: X` must be present. The split check avoids the contiguous-substring problem where `startedAt` metadata sits between the marker and content. This preserves fearless re-import while treating any actual difference as meaningful.

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

### Preset Backup & Restore (v2.4.96+, simplified v2.4.108, fixed v2.4.119)

Backups include color presets. Both default and custom presets are merged on import.

**Format:** `BackupV2` adds optional `presets` and `customPresets` fields (both `ColorPreset[]`). Version bumped from 1 to 2.

**Export:** `formatEntriesAsJson` includes both default and custom presets in the backup JSON.

**Import behavior:**
- **Default presets (`backup.presets`)**: **merged** (v2.4.119+). Existing kept; missing ones from backup added back. Users can delete default presets, so they must be restorable from backup.
- **Custom presets (`backup.customPresets`)**: **merged**. Existing custom presets are kept; new unique ones from the backup are appended.
- Both use `presetsEqual()` for deduplication (compares all 6 HSL values).
- v1 backups: no preset change (backward compatible).
- Multi-file import: both preset arrays are threaded through the processing loop (like entries) so each file merges against the accumulated result, not the stale closure value.
- `" + presets"` feedback only shows when presets actually changed. Empty or identical backup presets don't trigger it.

**Types:** `parseBackupJson` returns a `ParsedBackup` object (`{ entries, presets, customPresets }`) instead of bare `JournalEntry[]`. Presets are `ColorPreset[] | null` — null for v1 backups.

**Threading pattern:** `processBackupContent` accepts `currentPresets` and `currentCustomPresets` as params and returns the new values (no side effects). Callers thread both through and call `setPresets`/`setCustomPresets` once at the end. Same pattern as `currentEntries` for entry merging.

Code locations:
- `BackupV2` type: `src/features/export/utils/formatEntries.ts`
- `ParsedBackup` type + extraction: `src/features/export/utils/parseBackup.ts`
- Wiring (export/import) + `presetsEqual()`: `src/features/export/components/ExportButtons.tsx`

### Key Behaviors

- **Import only accepts encrypted backups** (files must start with `good days encrypted backup`)
- **Multi-file import** - Select multiple backup files at once, all processed and merged
- Import button is always enabled (can import into empty app)
- New dates from import are added as new entries
- `startedAt` is preserved (uses older timestamp if imported entry is older)
- Entries are re-sorted by date after import
- "Copy to clipboard" still copies plain text (not encrypted)
- Both clipboard copy functions include `entry.title` when present (v2.4.81+):
  - Normal mode (`formatEntriesForClipboard`): title as plain text between date and content
  - Poweruser mode (`formatEntriesAsText`): title as bold markdown (`**title**`) between date heading and started-at time

### Button Text

| Mode | Button | Default Text | On Hover |
|------|--------|--------------|----------|
| Normal | Copy | "copy entries" | — |
| Normal | Backup | "download backup" | — |
| Normal | Import | "import backup" | — |
| Poweruser | Copy | "copy markdown format" | — |
| Poweruser | Backup | "download AES-256-GCM backup" | — |
| Poweruser | Import | "import AES-256-GCM backup" | "multiple files accepted" |

The import button hover text change in poweruser mode is a literal string change (not a tooltip - we don't use tooltips). The Download icon stays visible in both default and hover states (v1.10.24+) — only hidden during feedback (success/error).

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
| Success + presets | "X entries + Y presets imported" | Confirm color (WCAG green) |
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

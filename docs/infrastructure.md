# Infrastructure — DNS, Hosting, Icons

This file contains set-once infrastructure details. For development workflow, see the root `CLAUDE.md`.

## Domain & DNS (Cloudflare)

### Architecture

```
User → Cloudflare DNS → GitHub Pages → serves site
```

| Component | Purpose |
|-----------|---------|
| **Cloudflare** | DNS management, domain registrar for `gdays.day` |
| **GitHub Pages** | Static site hosting, SSL certificate provisioning |
| **GitHub Actions** | Auto-deploys on push to `main` |

### DNS Records

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

## Troubleshooting

**SSL cert error on www**: Ensure the `www` DNS record is **Proxied** (orange cloud) in Cloudflare, and the redirect rule is active.

**DNS not resolving**: Check Cloudflare DNS records. Apex must be DNS only, www must be Proxied.

**Changes not appearing**:
1. Check GitHub Actions completed successfully
2. Verify version number in about panel matches pushed version
3. Hard refresh (Cmd+Shift+R) to bypass cache

## App Icons

**One icon, one shape, everywhere.** All icons use the same rounded design from `icon.svg`. No platform-specific workarounds.

### Icon Files

| File | Size | Purpose |
|------|------|---------|
| `icon.svg` | 1024x1024 | Master source — favicon, all PNGs generated from this |
| `apple-touch-icon.png` | 1024x1024 | iOS/macOS home screen & dock |
| `icon-192.png` | 192x192 | PWA manifest (Android) |
| `icon-512.png` | 512x512 | PWA manifest (Android) |
| `icon-1024.png` | 1024x1024 | PWA manifest (max quality) |
| `og-image.png` | 1200x630 | Social sharing (iMessage, Twitter, etc.) |
| `og-source.svg` | 1200x630 | Source SVG for og-image.png |

**og:image URL:** Must be an **absolute URL** (`https://gdays.day/og-image.png`) in `index.html`. Social crawlers require absolute URLs.

### Icon Design

Dark green rounded rect (rx=229) with light yellow square centered inside (25% border, 512px inner square on 1024px canvas). Colors are Preset 1 inverted. All icons are this same rounded shape — no square variants.

| Element | Color | HEX |
|---------|-------|-----|
| Inner square | Light yellow | `#fff9d1` |
| Border/background | Dark green | `#043d00` |

### Generating Icons

All PNGs are generated from the single `icon.svg` with `-b '#043d00'` to fill the entire canvas (no transparency — ensures full-size icons on macOS/iOS dock):

```bash
cd public
rsvg-convert icon.svg -w 1024 -h 1024 -b '#043d00' -o apple-touch-icon.png
rsvg-convert icon.svg -w 192 -h 192 -b '#043d00' -o icon-192.png
rsvg-convert icon.svg -w 512 -h 512 -b '#043d00' -o icon-512.png
rsvg-convert icon.svg -w 1024 -h 1024 -b '#043d00' -o icon-1024.png
rsvg-convert og-source.svg -w 1200 -h 630 -o og-image.png
```

### Manifest Config (vite.config.ts)

- `background_color: '#043d00'`
- `purpose: 'any'` — NOT `maskable`
- apple-touch-icon is linked in HTML separately, not in manifest

### Backup

Old icons backed up at `public/icon-backup/`.

## Pre-push Hook Setup

A pre-push hook runs `npm run typecheck` before every push to prevent CI failures.

To install (first time setup):
```bash
./scripts/setup-hooks.sh
```

If a push is blocked, fix the TypeScript errors shown and try again.

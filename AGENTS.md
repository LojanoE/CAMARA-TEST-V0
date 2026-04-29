# AGENTS.md — CAMARA-TEST-V0

## What this is

A static PWA (no build step, no bundler) for field photo capture with GPS/EXIF metadata stamping. Vanilla HTML/CSS/JS, entirely client-side. Spanish-language UI.

## Running locally

Must be served over HTTP — Service Workers and Camera APIs require `localhost` or HTTPS:

```
python -m http.server 8000    # then open http://localhost:8000
# or
npx serve .
```

Mobile testing requires HTTPS or USB debugging port-forwarded to localhost.

## Architecture

| File | Role |
|---|---|---|
| `index.html` | Single entry point, loads all scripts |
| `app.js` | Core logic: camera, GPS, IndexedDB, gallery, metadata overlay |
| `imageProcessorWorker.js` | Web Worker for bulk ZIP generation (uses `OffscreenCanvas`) |
| `sw.js` | Service Worker — cache-first on slow/offline, network-first otherwise |
| `connection-monitor.js` | Detects connection quality (effectiveType + ping to Supabase) |
| `db-manager.js` | Extended IndexedDB for frentes/actividades cache + sync queue |
| `supabase-client.js` | Supabase client with offline-first sync logic |
| `admin-panel.js` | Admin UI for GDR user to manage frentes/actividades |
| `piexif.js` / `exif.js` | EXIF read/write (vendored, not npm) |
| `jszip.min.js` / `FileSaver.min.js` | ZIP + download (vendored, not npm) |

- State lives in the global `appState` object in `app.js`.
- IndexedDB store name: `GDR_CAM_DB`, version 2:
  - `photos` — Captured images with metadata (auto-increment key, `timestamp` index)
  - `frentes_cache` — Local copy of work fronts from Supabase
  - `actividades_cache` — Local copy of activities from Supabase
  - `sync_queue` — Pending admin changes for offline sync
- `sw.js` cache name must be bumped on any deploy to invalidate old caches.
- `manifest.json` must stay in the same directory as `index.html` for correct PWA scope.

## Supabase Integration (v20+)

### Database Schema
```sql
frentes: id (uuid), nombre (text), activo (boolean), updated_at (timestamp)
actividades: id (uuid), nombre (text), activo (boolean), updated_at (timestamp)
```

### Offline-First Strategy
1. **App startup**: Load frentes/actividades from IndexedDB immediately (no blocking)
2. **Connection check**: Uses `effectiveType` + ping to Supabase
   - `2g/slow-2g`: Never sync (too slow)
   - `3g`: Sync only if ping < 2000ms
   - `4g`: Sync if ping < 3000ms
3. **Background sync**: If connection is good, fetch fresh data from Supabase and update IndexedDB
4. **Admin changes**: Stored in `sync_queue` when offline, processed when connection improves

### Admin Panel
- **Access**: Click gear icon (⚙️) in header, login with `GDR` / `Mirador1`
- **Features**: CRUD for frentes and actividades
- **Sync indicator**: Shows pending changes count
- **Manual sync**: Button to force sync when connection allows

### Connection Monitoring
- Real-time status indicator in header (icon changes based on quality)
- Tooltip shows detailed status on click
- Updates every 30 seconds + on online/offline events

## Key gotchas

- **No npm/build toolchain** — all dependencies are vendored `.js` files or loaded via CDN. Do not `npm install` anything; add new libs to both `index.html` and `sw.js` `ASSETS` array. Supabase client is loaded from CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js`).
- **No automated tests** — no test runner, no test files. Verify manually in browser.
- **piexif in Web Worker** — `imageProcessorWorker.js` shims `window`/`document` and imports `piexif.js` via `importScripts`. Changes to piexif must work in both contexts.
- **Image rotation** — `rotateImage()` returns a Promise; must be awaited before saving (race condition fix from v12.6).
- **GPS movement threshold** — `bestLocation` resets when user moves >15m (hardcoded in `updateLocationState`). New capture also resets it.
- **Gallery pagination** — loads 20 items at a time (`ITEMS_PER_PAGE` in `app.js`). Concurrency controlled via `galleryLoadID`.
- **Worker timeout** — `processImageInWorker` has a 15-second timeout per image.

## Deployment

Upload all files to any static host (GitHub Pages, Netlify, etc.). Ensure `sw.js` and `manifest.json` are at the same level as `index.html`. Bump `CACHE_NAME` in `sw.js` on every deploy.

## Conventions

- UI strings and user-facing messages are in Spanish.
- Error handling uses `showStatus(msg, type)` toast system (`'success' | 'error' | 'info' | 'warning'`).
- Form data persists in `localStorage` under key `gdrCamFormData` (activities excluded).
- Existing instruction file: `GEMINI.md` — detailed architecture and changelog.
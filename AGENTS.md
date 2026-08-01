# AGENTS.md — CAMARA-TEST-V0 (GDR-CAM)

## What this is

A static Progressive Web Application (PWA) for capturing field photos with embedded GPS and EXIF metadata. Built entirely with vanilla HTML/CSS/JS, no build step, no bundler, no package manager. Optimized for mobile devices and offline usage. All user-facing text is in Spanish.

The app allows users to:
- Capture photos using the device's native camera (`capture="environment"`).
- Automatically stamp images with GPS coordinates, cardinal direction (north arrow), timestamp, and form data (work front, coronamiento, observation category, activity).
- Store photos locally in IndexedDB as Blobs (not DataURLs) to avoid storage quota issues.
- Export single photos as JPG or bulk selections as a ZIP archive via a background Web Worker. Multi-photo ZIP exports also include a self-contained `catalogo.html`: a phone-gallery-style catalog (square thumbnail grid, 4 per row on desktop / 3 on mobile) with a lightbox per photo showing details and a "Copiar imagen" clipboard button. Catalog images are downscaled to max 1600 px to keep the HTML light (~40 photos ≈ 20-30 MB); the JPGs in the ZIP stay full resolution.
- Manage work fronts, activities, and coronamientos through an embedded admin panel that syncs with Supabase when connectivity allows.

---

## Running locally

Service Workers and Camera APIs require HTTPS or `localhost`. Use any static server:

```bash
# Windows (double-click start-server.bat)
start-server.bat

# Python (cross-platform)
python -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`.

For mobile testing, serve over HTTPS or use USB debugging port-forwarded to localhost.

To fully reset the app during development:
```javascript
// In browser console (F12)
indexedDB.deleteDatabase('GDR_CAM_DB');
localStorage.clear();
location.reload(true);
```
Also unregister the Service Worker via DevTools → Application → Service Workers.

---

## Architecture

### File roles

| File | Role |
|---|---|
| `index.html` | Single entry point. Loads all scripts in explicit order. Contains PWA manifest reference and service worker registration inline. |
| `app.js` | Core application logic: camera trigger, GPS tracking, form handling, metadata overlay, EXIF injection, gallery with pagination, single/bulk download orchestration. |
| `imageProcessorWorker.js` | Web Worker for background image processing during bulk ZIP generation. Uses `OffscreenCanvas` and `createImageBitmap`. |
| `sw.js` | Service Worker implementing a hybrid cache strategy. |
| `connection-monitor.js` | Detects connection quality using `navigator.connection.effectiveType` + active ping to Supabase REST endpoint. |
| `db-manager.js` | IndexedDB abstraction layer. Manages photo storage and local caches for frentes, actividades, coronamientos, plus a sync queue for admin changes. |
| `supabase-client.js` | Supabase client initialization and all CRUD/sync operations. Implements offline-first data loading. |
| `admin-panel.js` | Admin UI (modal) for managing frentes, actividades, and coronamientos. Handles auth, local cache updates, and sync queue. |
| `style.css` | All UI styles. Responsive, mobile-first, dark theme. Includes iOS anti-zoom rules and touch-friendly minimum sizes. |
| `frentes.json` | Static fallback containing initial lists of frentes and actividades. |
| `supabase-schema.sql` | Complete SQL to create Supabase tables, RLS policies, triggers, and seed data. |
| `piexif.js` / `exif.js` | Vendored libraries for reading and writing JPEG EXIF data. |
| `jszip.min.js` / `FileSaver.min.js` | Vendored libraries for offline ZIP creation and file downloads. |
| `app22.js` | Legacy file containing an older `getUserMedia`-based camera implementation. **Not loaded by `index.html`.** Kept for reference only. |

### IndexedDB schema

Database name: `GDR_CAM_DB`  
Current version: `3`

| Object Store | Purpose | Key / Indexes |
|---|---|---|
| `photos` | Captured images + metadata | `id` (auto-increment), index `timestamp` |
| `frentes_cache` | Local copy of work fronts from Supabase | `id` (UUID from Supabase) |
| `actividades_cache` | Local copy of activities from Supabase | `id` (UUID from Supabase) |
| `coronamientos_cache` | Local copy of coronamientos from Supabase | `id` (UUID from Supabase) |
| `sync_queue` | Pending admin changes for offline sync | `id` (auto-increment), indexes `timestamp`, `synced` |

---

## Technology Stack

- **HTML5 / CSS3 / JavaScript (ES6+)** — no frameworks.
- **IndexedDB** — local persistent storage for images and structured data.
- **Service Worker API** — offline support and smart asset caching.
- **Geolocation API** — high-accuracy GPS tracking with continuous `watchPosition`.
- **Web Workers & OffscreenCanvas** — non-blocking image processing for bulk exports.
- **File API / FileReader / Blob** — image handling and conversion.
- **piexif.js** — EXIF metadata manipulation in JPEGs.
- **JSZip + FileSaver.js** — local ZIP generation and downloads (vendored).
- **Supabase Client v2 (UMD from CDN)** — cloud backend for frentes/actividades/coronamientos.
- **Font Awesome 6 (CDN)** — icons.
- **Google Fonts: Roboto (CDN)** — typography.

---

## Supabase Integration

### Database Schema

```sql
frentes:       id (uuid), nombre (text), activo (boolean), updated_at (timestamp)
actividades:   id (uuid), nombre (text), activo (boolean), updated_at (timestamp)
coronamientos: id (uuid), nombre (text), activo (boolean), updated_at (timestamp)
```

All tables have Row Level Security (RLS) enabled. The current policies allow open SELECT/INSERT/UPDATE/DELETE for simplicity, since admin authentication is handled client-side.

Triggers automatically update `updated_at` on row modifications.

### Offline-First Strategy

1. **App startup**: Immediately load frentes, actividades, and coronamientos from IndexedDB cache so the UI is never blocked.
2. **Connection check**: `CONNECTION_MONITOR` evaluates `effectiveType` and pings Supabase.
3. **Background refresh**: If the connection is good enough, fetch fresh data from Supabase, update IndexedDB caches, and notify the UI via callback.
4. **Pending sync**: Admin changes made while offline are stored in `sync_queue`. When connectivity improves, `SUPABASE_CLIENT.syncPendingChanges()` processes them.

### Sync thresholds

| Connection | Ping threshold | Action |
|---|---|---|
| `slow-2g` / `2g` | — | Never sync |
| `3g` | < 2000 ms | Sync allowed |
| `4g` + ping < 1000 ms | — | Excellent, sync |
| Ping 2000–5000 ms | — | Fair, do not sync |
| Offline / failed ping | — | Do not sync |

---

## Admin Panel

- **Access**: Click the gear icon (⚙️) in the header.
- **Login**: `GDR` / `Mirador1` (hardcoded in `admin-panel.js`).
- **Session**: Persisted in `localStorage` (`gdrAdminSession`) for 24 hours.
- **Features**: CRUD for frentes, actividades, and coronamientos. Soft-delete only (sets `activo = false`).
- **Sync indicator**: Shows pending changes count. Manual sync button forces processing of the `sync_queue` when connection allows.
- **Immediate local effect**: Changes are applied to IndexedDB cache right away, so the main form reflects them instantly, even before cloud sync.

---

## Connection Monitoring

- Real-time status icon in the header updates every 30 seconds and on `online`/`offline` events.
- Clicking the icon shows a toast with detailed status and ping time.
- Visual states: `offline` (⚠️), `poor` (🐌), `fair` (⏳), `good` (✓), `excellent` (✓✓).

---

## Key Gotchas

- **No npm/build toolchain** — all dependencies are vendored `.js` files or loaded via CDN. Do not run `npm install`. When adding new libraries, include them in both `index.html` and the `ASSETS` array in `sw.js`.
- **No automated tests** — no test runner, no test files. Verify manually in browser.
- **piexif in Web Worker** — `imageProcessorWorker.js` shims `window` and `document` before importing `piexif.js` via `importScripts`. Any change to piexif must be tested in both main thread and worker contexts.
- **Image rotation** — `rotateImage()` returns a `Promise`. It must be `await`ed before saving to avoid race conditions.
- **GPS movement threshold** — `bestLocation` resets when the user moves > 15 m (hardcoded in `updateLocationState`). A new capture also resets it.
- **Gallery pagination** — Loads 20 items at a time (`ITEMS_PER_PAGE` in `app.js`). Concurrency controlled via `galleryLoadID` to prevent overlapping renders.
- **Worker timeout** — `processImageInWorker` has a 15-second timeout per image.
- **Blob storage** — Photos are stored as `Blob` objects in IndexedDB (migrated from DataURL in v12.7). The gallery handles backward compatibility with legacy string entries.
- **Cache invalidation** — The `CACHE_NAME` constant in `sw.js` must be bumped on every deploy. Failure to do so will leave users with stale cached assets.
- **PWA scope** — `manifest.json` and `sw.js` must remain in the same directory as `index.html`.
- **Legacy file** — `app22.js` is not loaded by `index.html`. Do not edit it expecting runtime changes.
- **Catalog HTML** — `buildCatalogHTML()` (app.js) embeds photos as base64 data URLs inside `catalogo.html`, downscaled via `downscaleForCatalog()` (max 1600 px, JPEG 0.85). Do not switch to relative JPG paths: drawing a `file://`-loaded image to canvas taints it, which breaks the "Copiar imagen" clipboard feature in the lightbox.

---

## Deployment

1. Ensure all files listed in the Architecture table are uploaded.
2. Verify `sw.js` and `manifest.json` are at the same level as `index.html`.
3. Bump `CACHE_NAME` in `sw.js` to force cache invalidation.
4. Serve over HTTPS (required for Service Workers, camera, and high-accuracy GPS).
5. Run `supabase-schema.sql` once in the Supabase SQL Editor to create tables, policies, triggers, and seed data.

Files required for production:
```
index.html
style.css
app.js
sw.js
connection-monitor.js
db-manager.js
supabase-client.js
admin-panel.js
manifest.json
exif.js
piexif.js
jszip.min.js
FileSaver.min.js
img/
  ├── LOGO GDR.jpeg
  └── icon-512x512.png
```

---

## Conventions

- **UI language**: Spanish. All user-facing messages, labels, and toasts are in Spanish.
- **State management**: Runtime state lives in the global `appState` object declared in `app.js`.
- **Error handling**: Use `showStatus(msg, type)` where `type` is `'success' | 'error' | 'info' | 'warning'`.
- **Form persistence**: `localStorage` key `gdrCamFormData` stores the last used work front, coronamiento, and observation category. **Activities are intentionally excluded** from persistence.
- **CSS variables**: Defined in `:root` in `style.css` (`--primary-color`, `--success-color`, etc.).
- **Touch targets**: Minimum 44 px for interactive elements; big button is 52 px.

---

## Security Considerations

- **Hardcoded credentials**: The admin password (`Mirador1`) and Supabase anon key are visible in plain text in `admin-panel.js`, `supabase-client.js`, and `connection-monitor.js`.
- **Permissive RLS**: Supabase policies currently allow unrestricted INSERT/UPDATE/DELETE. For a production environment with sensitive data, restrict write policies or move admin writes to a secure Edge Function / service role key.
- **Client-side auth only**: The admin login is purely a UI gate; there is no server-side session validation.
- **HTTPS required**: While the code does not enforce HTTPS, browser APIs (Service Worker, camera, precise geolocation) will fail or degrade without it.

---

## Testing

There is no automated test suite. All verification is manual:

1. Start the local server (`start-server.bat` or `python -m http.server 8000`).
2. Open `http://localhost:8000`.
3. Verify the GPS indicator appears and stabilizes.
4. Capture a photo, fill the form, and save.
5. Check the gallery for the new entry.
6. Test bulk download by selecting multiple photos.
7. Open the admin panel (⚙️), log in with `GDR` / `Mirador1`, add/edit an item, and verify it appears in the form dropdowns.
8. Disconnect from the internet, reload the page, and confirm frentes/actividades still load from IndexedDB cache.
9. Reconnect and verify pending admin changes sync to Supabase.

If the app behaves unexpectedly, fully clear state via:
```javascript
indexedDB.deleteDatabase('GDR_CAM_DB');
localStorage.clear();
location.reload(true);
```
Then unregister the Service Worker and hard-refresh (`Ctrl+F5`).

---

## Existing instruction files

- `GEMINI.md` — Contains detailed architecture notes and a version changelog (v12.6, v12.7, v20+).
- `README-PRODUCCION.md` — Quick-start checklist for local run and Supabase setup.
- `DEPLOY-GUIDE.md` — Step-by-step production deployment and troubleshooting guide.
- `DEBUG.md` — Common errors, expected console log sequences, and reset instructions.

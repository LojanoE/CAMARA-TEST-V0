# Project: CAM-TEST-V0 (GDR-CAM)

## Overview

**CAM-TEST-V0** (also referred to as GDR-CAM) is a Progressive Web Application (PWA) designed for capturing field photos with embedded metadata. It is optimized for mobile devices and offline usage.

The application allows users to:
1.  **Capture Photos:** Uses the device's native camera application for high-quality capture (via `capture="environment"`).
2.  **Embed Metadata:** Automatically stamps the photo with:
    *   Date and Time.
    *   GPS Coordinates (Latitude, Longitude, Accuracy, Altitude, Speed).
    *   Cardinal Direction (North Arrow).
    *   User-filled form data (Work Front, Coronation, Observation Category, Activity).
3.  **Offline Gallery:** Stores captured photos locally using **IndexedDB**, allowing persistent access without an internet connection.
4.  **GPS Tracking:** Continuously watches the device's location to provide the most accurate coordinates possible when saving.
5.  **Export:** Supports batch downloading of photos. Originally designed for ZIP export, currently configured for sequential bulk download.

## Architecture

This is a client-side only web application (Static Web App) built with vanilla HTML, CSS, and JavaScript.

### Key Files

*   **`index.html`**: The main entry point. Contains the structure for the camera trigger, form, result preview, and local gallery.
*   **`app.js`**: The core logic controller. Handles:
    *   PWA registration.
    *   Camera interaction (via `<input type="file">`).
    *   GPS tracking (`navigator.geolocation`).
    *   Image processing (Canvas drawing, resizing, EXIF manipulation).
    *   IndexedDB management (Saving/Loading/Deleting photos).
    *   UI state management.
*   **`style.css`**: Custom styling for the UI, ensuring responsiveness and mobile-friendliness.
*   **`sw.js`**: Service Worker script. Implements a "Smart Cache" strategy:
    *   **Network First** for fast connections (WiFi/4G) to ensure updates.
    *   **Cache First** for slow connections (2G) or offline mode.
*   **`manifest.json`**: Web App Manifest for PWA installation (icons, theme colors, name).
*   **`frentes.json`**: A JSON array containing predefined "Work Front" (Frente de Trabajo) options for the dropdown menu.
*   **`exif.js` / `piexif.js`**: Libraries used for reading and writing EXIF data in JPEG images.

### Technologies & Libraries

*   **HTML5 / CSS3 / JavaScript (ES6+)**
*   **IndexedDB:** For local storage of image blobs and metadata.
*   **Service Worker API:** For offline support and caching.
*   **Geolocation API:** For high-precision GPS tracking.
*   **piexif.js:** For manipulating JPEG EXIF data.
*   **FileSaver.js:** For handling file downloads.

## Usage & Development

### Prerequisites

*   A modern web browser (Chrome, Edge, Safari).
*   A local static server for development (e.g., VS Code Live Server, Python `http.server`) is required because Service Workers and Camera APIs require **HTTPS** or **localhost**.

### Running Locally

1.  Clone the repository.
2.  Serve the directory using a static server.
    *   Example with Python: `python -m http.server 8000`
    *   Example with Node/serve: `npx serve .`
3.  Open `http://localhost:8000` in your browser.
4.  **Note:** For mobile testing, you need to access via HTTPS or enable USB debugging port forwarding to `localhost`.

### Build/Deployment

Since this is a static site, "deployment" simply consists of uploading the files to any static hosting provider (GitHub Pages, Netlify, Vercel, Apache/Nginx web root).

*   **Ensure `sw.js` and `manifest.json` are in the root** relative to `index.html` to ensure the PWA scope is correct.

### Features

*   **Native Camera Integration:** Uses `<input type="file" capture="environment">` to leverage the phone's native camera app capabilities (HDR, Zoom, native processing).
*   **Smart GPS:** The app continuously watches location in the background while the user fills out the form, ensuring the metadata applied at save time is the most accurate available.
*   **Metadata Overlay:** Draws a visual watermark (North arrow, GPS, Timestamp) directly onto the image pixels before saving.
*   **EXIF Injection:** Injects structured JSON data into the `UserComment` EXIF tag and standard GPS tags for interoperability.

## Conventions

*   **Formatting:** Standard HTML/CSS/JS formatting.
*   **State Management:** A global `appState` object in `app.js` holds the current runtime state (location, active photo, database connection).
*   **Error Handling:** User-facing errors are displayed via a toast notification system (`showStatus` function).

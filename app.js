// GDR-CAM Application Logic - Native Camera + Gallery Version + Enhanced Metadata

// Anti-zoom para iOS: prevenir pinch-to-zoom y double-tap zoom
(function() {
    document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('touchmove', function(e) {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    var lastTouchEnd = 0;
    document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
})();

// Create a Web Worker instance for image processing
const imageProcessorWorker = new Worker('./imageProcessorWorker.js');

// Store Promises for ongoing worker tasks
const workerPromises = new Map();

imageProcessorWorker.onmessage = (event) => {
    const { id, processedBlob, catalogBlob, error } = event.data;
    if (workerPromises.has(id)) {
        if (processedBlob) {
            workerPromises.get(id).resolve({ processedBlob, catalogBlob });
        } else if (error) {
            workerPromises.get(id).reject(new Error(error));
        }
        workerPromises.delete(id);
    }
};

imageProcessorWorker.onerror = (error) => {
    console.error("Web Worker error:", error);
    showStatus('Error en el procesamiento de imágenes en segundo plano.', 'error');
};

// Application state
const appState = {
    capturedPhotoDataUrl: null,
    photoWithMetadata: null,
    currentLocation: null,
    bestLocation: null,
    locationWatcher: null,
    imageRotation: 0,
    originalPhotoWithMetadata: null,
    isGpsDisplayThrottled: false,
    gpsDisplayThrottleTime: 5000,
    isFormInteractionActive: false,
    galleryLoadID: 0,
    db: null // IndexedDB instance
};

let currentEditPhotoId = null;

// DOM Elements
const elements = {
    cameraInput: null,
    canvas: null,
    takePhotoBtn: null,
    formSection: null,
    resultSection: null,
    photoPreview: null,
    saveMetadataBtn: null,
    newCaptureBtn: null,
    downloadPhotoBtn: null,
    cameraSection: null,
    statusMessage: null,
    saveWithoutFormBtn: null,
    rotateLeftBtn: null,
    rotateRightBtn: null,
    otherWorkFrontGroup: null,
    otherWorkFrontInput: null,
    workFrontSearch: null,
    workFrontOptions: null,
    gpsStatus: null,
    // Gallery Elements
    galleryGrid: null,
    selectAllBtn: null,
    refreshGalleryBtn: null,
    downloadSelectedBtn: null,
    deleteSelectedBtn: null,
    galleryCount: null
};

// Initialize the application
async function init() {
    console.log('Initializing app...');
    // Get DOM elements
    elements.cameraInput = document.getElementById('camera-input');
    elements.canvas = document.createElement('canvas');
    elements.takePhotoBtn = document.getElementById('take-photo');
    elements.formSection = document.getElementById('form-section');
    elements.resultSection = document.getElementById('result-section');
    elements.photoPreview = document.getElementById('photo-preview');
    elements.saveMetadataBtn = document.getElementById('save-metadata');
    elements.newCaptureBtn = document.getElementById('new-capture');
    elements.downloadPhotoBtn = document.getElementById('download-photo');
    elements.cameraSection = document.getElementById('camera-section');
    elements.statusMessage = document.getElementById('status-message');
    elements.saveWithoutFormBtn = document.getElementById('save-photo-without-form');
    elements.rotateLeftBtn = document.getElementById('rotate-left');
    elements.rotateRightBtn = document.getElementById('rotate-right');
    elements.otherWorkFrontGroup = document.getElementById('other-work-front-group');
    elements.otherWorkFrontInput = document.getElementById('other-work-front');
    elements.workFrontSearch = document.getElementById('work-front-search');
    elements.workFrontOptions = document.getElementById('work-front-options');
    elements.gpsStatus = document.getElementById('gps-status');
    // Gallery Elements
    elements.galleryGrid = document.getElementById('gallery-grid');
    elements.selectAllBtn = document.getElementById('select-all-btn');
    elements.refreshGalleryBtn = document.getElementById('refresh-gallery-btn');
    elements.downloadSelectedBtn = document.getElementById('download-selected-btn');
    elements.deleteSelectedBtn = document.getElementById('delete-selected-btn');
    elements.galleryCount = document.getElementById('gallery-count');
    
    // Initialize IndexedDB with new schema (photos + frentes + actividades + sync)
    try {
        console.log('Initializing DB_MANAGER...');
        await DB_MANAGER.init();
        console.log('DB_MANAGER initialized');
        await initDB(); // Initialize photo database (uses DB_MANAGER connection)
        console.log('initDB completed');
    } catch (dbError) {
        console.error('Database initialization error:', dbError);
        showStatus('Error al iniciar base de datos: ' + dbError.message, 'error');
    }
    
    // Load work fronts from Supabase (offline-first)
    try {
        await loadWorkFronts();
    } catch (wfError) {
        console.error('Error loading work fronts:', wfError);
    }
    loadPersistentData();
    attachEventListeners();
    initConnectionMonitor(); // Start monitoring connection
    initAdminPanel(); // Setup admin panel button
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js');
        });
    }
        
    startGpsSystem();
    console.log('App initialized successfully');
}

// --- IndexedDB Logic ---
async function initDB() {
    // Use DB_MANAGER's connection if available (version 2 schema)
    if (DB_MANAGER.db) {
        appState.db = DB_MANAGER.db;
        loadGallery();
        return;
    }
    
    // Fallback: wait for DB_MANAGER to initialize
    try {
        await DB_MANAGER.init();
        appState.db = DB_MANAGER.db;
        loadGallery();
    } catch (error) {
        console.error("DB Error:", error);
        showStatus('Error al iniciar base de datos local', 'error');
    }
}

function savePhotoToDB(photoDataUrl, metadata) {
    return new Promise((resolve, reject) => {
        if (!appState.db) return reject(new Error('Base de datos no lista. Recargue la página.'));

        // Convert DataURL to Blob for storage efficiency and to avoid QuotaExceededError
        const blob = dataURLtoBlob(photoDataUrl);

        const transaction = appState.db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');

        const photoRecord = {
            image: blob, // Store Blob
            metadata: metadata,
            timestamp: new Date().getTime(), // For sorting
            displayDate: new Date().toLocaleString()
        };

        const request = store.add(photoRecord);

        transaction.oncomplete = () => {
            console.log('Transaction completed: Photo saved.');
            resolve();
            loadGallery(); // Refresh gallery
        };

        transaction.onerror = (event) => {
            const error = event.target.error;
            console.error('Transaction error:', error);
            if (error && (error.name === 'QuotaExceededError' || error.name === 'QuotaExceededError')) {
                reject(new Error('¡Memoria llena! Elimine fotos de la galería.'));
            } else {
                reject(new Error('Error de guardado: ' + (error ? error.message : 'Desconocido')));
            }
        };

        request.onerror = (event) => {
            // This usually bubbles to transaction.onerror, but we catch it here too just in case
            const error = event.target.error;
            console.error('Request error:', error);
            if (error && (error.name === 'QuotaExceededError' || error.name === 'QuotaExceededError')) {
                reject(new Error('¡Memoria llena! Elimine fotos de la galería.'));
            } else {
                reject(new Error('Error al añadir foto: ' + (error ? error.message : 'Desconocido')));
            }
        };
    });
}

function updatePhotoInDB(id, updates) {
    return new Promise((resolve, reject) => {
        if (!appState.db) return reject(new Error('Base de datos no lista.'));
        const transaction = appState.db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.get(id);
        request.onsuccess = () => {
            const photo = request.result;
            if (!photo) return reject(new Error('Foto no encontrada.'));
            const updated = { ...photo, ...updates };
            const putRequest = store.put(updated);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        request.onerror = () => reject(request.error);
    });
}

// Pagination State
appState.galleryCursor = null; // To store the last cursor key if needed, or simply count
appState.itemsLoaded = 0;
const ITEMS_PER_PAGE = 20;

function loadGallery(reset = true) {
    if (!appState.db) return;

    // Concurrency control: Increment ID for this load attempt
    appState.galleryLoadID++;
    const currentLoadID = appState.galleryLoadID;

    if (reset) {
        elements.galleryGrid.innerHTML = '';
        appState.itemsLoaded = 0;
        // Remove existing "Load More" button if any
        const existingBtn = document.getElementById('load-more-btn');
        if (existingBtn) existingBtn.remove();
    }

    const transaction = appState.db.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev'); // Newest first

    let advanced = false;
    let countInBatch = 0;
    
    // Determine how many items to skip (only if NOT resetting)
    const skipCount = reset ? 0 : appState.itemsLoaded;

    request.onsuccess = (event) => {
        // If a newer load has started, abort this one
        if (currentLoadID !== appState.galleryLoadID) return;

        const cursor = event.target.result;
        
        if (!cursor) {
            // End of list
            if (appState.itemsLoaded === 0) {
                elements.galleryGrid.innerHTML = '<p class="empty-msg">No hay fotos guardadas aún.</p>';
            }
            const existingBtn = document.getElementById('load-more-btn');
            if (existingBtn) existingBtn.style.display = 'none';
            elements.galleryCount.textContent = appState.itemsLoaded;
            updateGalleryButtons();
            return;
        }

        // Check if we need to skip items (simple pagination logic)
        if (skipCount > 0 && !advanced) {
             advanced = true;
             cursor.advance(skipCount);
             return;
        }

        if (countInBatch < ITEMS_PER_PAGE) {
            renderGalleryItem(cursor.value);
            countInBatch++;
            appState.itemsLoaded++;
            cursor.continue();
        } else {
            // Batch limit reached
            createLoadMoreButton();
            elements.galleryCount.textContent = appState.itemsLoaded + '+'; // Indicate more
            updateGalleryButtons();
        }
    };
}

function createLoadMoreButton() {
    let btn = document.getElementById('load-more-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'load-more-btn';
        btn.className = 'btn secondary full-width'; // Reuse existing styles
        btn.innerHTML = '<i class="fas fa-plus"></i> Cargar más fotos';
        btn.style.marginTop = '20px';
        btn.style.gridColumn = '1 / -1'; // Span full width in grid
        btn.onclick = () => {
            btn.remove(); // Remove self before loading more
            loadGallery(false); // Load next batch
        };
        elements.galleryGrid.after(btn); // Place after the grid
    }
}

function renderGalleryItem(item) {
    const template = document.getElementById('gallery-item-template');
    const clone = template.content.cloneNode(true);
    const div = clone.querySelector('.gallery-item');
    const img = clone.querySelector('img');
    const checkbox = clone.querySelector('.gallery-checkbox');
    const editBtn = clone.querySelector('.gallery-edit-btn');

    // Handle Blob or Legacy DataURL
    if (item.image instanceof Blob) {
        img.src = URL.createObjectURL(item.image);
    } else {
        img.src = item.image;
    }

    checkbox.dataset.id = item.id;
    div.dataset.id = item.id;

    // Selection logic
    div.addEventListener('click', (e) => {
        if (e.target !== checkbox && !e.target.closest('.gallery-edit-btn')) {
            checkbox.checked = !checkbox.checked;
        }
        div.classList.toggle('selected', checkbox.checked);
        updateGalleryButtons();
    });

    checkbox.addEventListener('change', () => {
        div.classList.toggle('selected', checkbox.checked);
        updateGalleryButtons();
    });

    // Edit button logic
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditMetadataModal(item.id);
        });
    }

    elements.galleryGrid.appendChild(clone);
}

function deleteSelectedPhotos() {
    if (!appState.db) return;
    
    const checkboxes = document.querySelectorAll('.gallery-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (!confirm(`¿Eliminar ${checkboxes.length} fotos seleccionadas?`)) return;

    const transaction = appState.db.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');

    let deleted = 0;
    checkboxes.forEach(cb => {
        store.delete(Number(cb.dataset.id));
        deleted++;
    });

    transaction.oncomplete = () => {
        showStatus(`${deleted} fotos eliminadas.`, 'success');
        loadGallery();
    };
}

async function downloadSelectedPhotos() {
    const checkboxes = document.querySelectorAll('.gallery-checkbox:checked');
    if (checkboxes.length === 0) return;

    elements.downloadSelectedBtn.disabled = true;
    const originalBtnText = '<i class="fas fa-download"></i> Descargar';
    
    const total = checkboxes.length;
    let processed = 0;
    let errors = 0;

    if (total === 1) {
        // Single file: Direct download (existing behavior)
        showStatus(`Descargando foto...`, 'info');
        const cb = checkboxes[0];
        
        try {
            const item = await getPhotoFromDB(Number(cb.dataset.id));
            if (item) {
                let imageDataUrl = item.image;
                if (item.image instanceof Blob) {
                    imageDataUrl = await blobToDataURL(item.image);
                }

                // For single download, process on main thread for simplicity
                const finalImage = await addTimestampAndLogoToImage(imageDataUrl); 
                const dateStr = new Date(item.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `GDR_${dateStr}_ID${item.id}.jpg`;
                saveAs(dataURLtoBlob(finalImage), filename);
                showStatus('Descarga completada.', 'success');
            }
        } catch (e) {
            console.error("Error downloading single photo:", e);
            showStatus('Error al descargar la imagen.', 'error');
        }
    } else {
        // Multiple files: ZIP Archive, use Web Worker SEQUENTIALLY.
        // Everything accumulated is kept as Blobs (never strings/ArrayBuffers)
        // so memory stays flat no matter how many photos are exported.
        showStatus(`Iniciando descarga de ${total} fotos...`, 'info');
        const zipWriter = createStoreZipWriter();
        const checkboxArray = Array.from(checkboxes);
        const catalogParts = [];

        for (let i = 0; i < checkboxArray.length; i++) {
            const cb = checkboxArray[i];
            const currentPhotoId = Number(cb.dataset.id);

            // Update UI
            const percentage = Math.round(((i) / total) * 100);
            elements.downloadSelectedBtn.innerHTML = `<span class="loading"></span> ${i + 1}/${total} (${percentage}%)`;

            // Yield to main thread to ensure UI updates
            await new Promise(resolve => setTimeout(resolve, 50));

            try {
                const item = await getPhotoFromDB(currentPhotoId);
                if (item) {
                    const dateStr = new Date(item.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const filename = `GDR_${dateStr}_ID${item.id}.jpg`;

                    // Legacy entries are stored as data URL strings
                    const imageBlob = item.image instanceof Blob ? item.image : dataURLtoBlob(item.image);

                    // Process SINGLE photo via Worker
                    const result = await processImageInWorker(currentPhotoId, imageBlob);

                    if (result && result.processedBlob) {
                        // Wrap the fragment in a Blob right away so its base64
                        // string can be garbage collected
                        const thumbPart = new Blob([buildCatalogThumbHTML({
                            dataURL: await blobToDataURL(result.catalogBlob),
                            filename: filename,
                            metadata: item.metadata || {},
                            displayDate: item.displayDate || ''
                        }, catalogParts.length)]);
                        await zipWriter.add(filename, result.processedBlob, new Date(item.timestamp));
                        catalogParts.push(thumbPart);
                        processed++;
                    } else {
                        console.error(`Failed to process photo ${currentPhotoId}`);
                        errors++;
                    }
                }
            } catch (e) {
                if (e instanceof RangeError) {
                    // ZIP size limit reached: continuing would fail for every photo
                    showStatus(e.message, 'error');
                    elements.downloadSelectedBtn.innerHTML = originalBtnText;
                    elements.downloadSelectedBtn.disabled = false;
                    return;
                }
                console.error(`Error processing photo ${currentPhotoId}:`, e);
                errors++;
            }
        }

        if (processed === 0) {
            showStatus('No se pudieron procesar las fotos.', 'error');
            elements.downloadSelectedBtn.innerHTML = originalBtnText;
            elements.downloadSelectedBtn.disabled = false;
            return;
        }

        try {
            elements.downloadSelectedBtn.innerHTML = 'Generando catálogo...';
            await zipWriter.add('catalogo.html', buildCatalogBlob(catalogParts), new Date());

            elements.downloadSelectedBtn.innerHTML = 'Empaquetando ZIP...';
            showStatus('Generando archivo ZIP final...', 'info');

            await new Promise(resolve => setTimeout(resolve, 100)); // Final yield

            const content = zipWriter.finish();
            const zipName = `GDR_CAM_Pack_${new Date().getTime()}.zip`;
            saveAs(content, zipName);

            if (errors > 0) {
                showStatus(`Descarga con advertencias: ${processed} ok, ${errors} fallos.`, 'warning');
            } else {
                showStatus('ZIP descargado correctamente.', 'success');
            }
        } catch (e) {
            console.error("Error generating ZIP:", e);
            showStatus(e instanceof RangeError ? e.message : 'Error al crear el ZIP.', 'error');
        }
    }

    elements.downloadSelectedBtn.innerHTML = originalBtnText;
    elements.downloadSelectedBtn.disabled = false;
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// CRC-32 (IEEE) lookup table for the ZIP writer
const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

// Reads the Blob in slices so large entries (catalogo.html) never need a
// single big ArrayBuffer
async function crc32OfBlob(blob) {
    const SLICE_SIZE = 8 * 1024 * 1024;
    let crc = 0xFFFFFFFF;
    for (let start = 0; start < blob.size; start += SLICE_SIZE) {
        const bytes = new Uint8Array(await blob.slice(start, start + SLICE_SIZE).arrayBuffer());
        for (let i = 0; i < bytes.length; i++) {
            crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Minimal ZIP writer (STORE, no compression, no ZIP64). The output Blob is
// composed from references to the entry Blobs, so photo bytes are never copied
// into JS memory (JSZip.generateAsync buffers the whole archive, which made
// mobile browsers crash with 50+ photos). Throws RangeError past 4 GB.
function createStoreZipWriter() {
    const ZIP32_LIMIT = 0xFFFFFFFF;
    const SIZE_ERROR = 'El ZIP supera el límite de 4 GB. Exporta menos fotos a la vez.';
    const parts = [];
    const entries = [];
    let offset = 0;

    function toDosDateTime(date) {
        if (!(date instanceof Date) || isNaN(date.getTime()) || date.getFullYear() < 1980) {
            date = new Date();
        }
        return {
            time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
            date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
        };
    }

    return {
        async add(name, blob, date) {
            const nameBytes = new TextEncoder().encode(name);
            const headerSize = 30 + nameBytes.length;
            if (offset + headerSize + blob.size > ZIP32_LIMIT || entries.length >= 0xFFFF) {
                throw new RangeError(SIZE_ERROR);
            }

            const crc = await crc32OfBlob(blob);
            const dos = toDosDateTime(date);

            const header = new Uint8Array(headerSize);
            const view = new DataView(header.buffer);
            view.setUint32(0, 0x04034b50, true);  // local file header signature
            view.setUint16(4, 20, true);          // version needed to extract
            view.setUint16(6, 0x0800, true);      // flags: UTF-8 file name
            view.setUint16(8, 0, true);           // method: STORE
            view.setUint16(10, dos.time, true);
            view.setUint16(12, dos.date, true);
            view.setUint32(14, crc, true);
            view.setUint32(18, blob.size, true);  // compressed size
            view.setUint32(22, blob.size, true);  // uncompressed size
            view.setUint16(26, nameBytes.length, true);
            view.setUint16(28, 0, true);          // extra field length
            header.set(nameBytes, 30);

            entries.push({ nameBytes, crc, size: blob.size, dos, offset });
            parts.push(header, blob);
            offset += headerSize + blob.size;
        },

        finish() {
            const centralStart = offset;
            let centralSize = 0;

            for (const entry of entries) {
                const record = new Uint8Array(46 + entry.nameBytes.length);
                const view = new DataView(record.buffer);
                view.setUint32(0, 0x02014b50, true);  // central directory signature
                view.setUint16(4, 20, true);          // version made by
                view.setUint16(6, 20, true);          // version needed to extract
                view.setUint16(8, 0x0800, true);      // flags: UTF-8 file name
                view.setUint16(10, 0, true);          // method: STORE
                view.setUint16(12, entry.dos.time, true);
                view.setUint16(14, entry.dos.date, true);
                view.setUint32(16, entry.crc, true);
                view.setUint32(20, entry.size, true);
                view.setUint32(24, entry.size, true);
                view.setUint16(28, entry.nameBytes.length, true);
                // extra/comment length, disk start and attributes stay 0
                view.setUint32(42, entry.offset, true);
                record.set(entry.nameBytes, 46);
                parts.push(record);
                centralSize += record.length;
            }

            if (centralStart + centralSize + 22 > ZIP32_LIMIT) {
                throw new RangeError(SIZE_ERROR);
            }

            const end = new Uint8Array(22);
            const view = new DataView(end.buffer);
            view.setUint32(0, 0x06054b50, true);      // end of central directory signature
            view.setUint16(8, entries.length, true);  // entries on this disk
            view.setUint16(10, entries.length, true); // total entries
            view.setUint32(12, centralSize, true);
            view.setUint32(16, centralStart, true);
            parts.push(end);

            return new Blob(parts, { type: 'application/zip' });
        }
    };
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Builds the catalog grid item for one photo (thumbnail + hidden details used
// by the lightbox)
function buildCatalogThumbHTML(entry, idx) {
    const m = entry.metadata || {};
    // location can be flat ({latitude,...}) or GeolocationPosition-like ({coords:{...}})
    const loc = m.location || {};
    const coords = loc.coords || loc;

    const details = [];
    if (m.workFront) details.push(['Frente', m.workFront]);
    if (m.coronation) details.push(['Coronamiento', m.coronation]);
    if (m.activityPerformed) details.push(['Actividad', m.activityPerformed]);
    if (m.observationCategory) details.push(['Categoría de observación', m.observationCategory]);
    if (entry.displayDate) details.push(['Fecha', entry.displayDate]);
    if (coords.latitude != null && coords.longitude != null) {
        let gps = `${Number(coords.latitude).toFixed(6)}, ${Number(coords.longitude).toFixed(6)}`;
        if (coords.accuracy != null) gps += ` (±${Math.round(coords.accuracy)} m)`;
        details.push(['Coordenadas GPS', gps]);
    }
    if (coords.altitude != null) details.push(['Altitud', `${Math.round(coords.altitude)} m s.n.m.`]);
    details.push(['Archivo', entry.filename]);

    const rows = details.map(([label, value]) =>
        `<div class="detail-row"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${escapeHtml(value)}</span></div>`
    ).join('');

    return `      <div class="thumb" data-idx="${idx}" data-filename="${escapeHtml(entry.filename)}">
        <img src="${entry.dataURL}" alt="${escapeHtml(entry.filename)}" loading="lazy">
        <div class="details" hidden>${rows}</div>
      </div>
`;
}

// Builds a self-contained HTML photo catalog, phone-gallery style: square
// thumbnail grid + lightbox with details, copy-to-clipboard and download
// buttons. Images are embedded as data URLs so the copy canvas is never
// tainted when the file is opened from file://
// thumbParts are the Blob fragments from buildCatalogThumbHTML: the document
// (tens of MB of base64) is never held as a single JS string.
function buildCatalogBlob(thumbParts) {
    const generated = new Date().toLocaleString();

    const head = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catálogo Fotográfico GDR-CAM</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Roboto, Arial, sans-serif; background: #1A2230; color: #f8f9fa; padding: 12px; }
  header { text-align: center; margin-bottom: 14px; }
  header h1 { font-size: 1.3rem; color: #ffffff; }
  header p { font-size: 0.85rem; color: #9fb0c7; margin-top: 4px; }
  .search-bar { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 8px; }
  .search-bar input { flex: 1; min-width: 150px; max-width: 320px; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #496596; background: #232d3f; color: #f8f9fa; font-size: 0.95rem; }
  .search-bar input:focus { outline: none; border-color: #007bff; }
  .search-bar input::placeholder { color: #9fb0c7; }
  .search-count { text-align: center; color: #9fb0c7; font-size: 0.8rem; margin-bottom: 8px; min-height: 1em; }
  .catalog { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-width: 1200px; margin: 0 auto; }
  .thumb { aspect-ratio: 1; border-radius: 6px; overflow: hidden; cursor: pointer; background: #232d3f; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.15s; }
  .thumb:hover img { transform: scale(1.04); }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.93); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .lightbox[hidden] { display: none; }
  .lb-content { max-width: 900px; width: 100%; max-height: 100vh; overflow-y: auto; padding: 16px; }
  .lb-img-wrap { position: relative; text-align: center; }
  .lb-img-wrap img { max-width: 100%; max-height: 62vh; object-fit: contain; border-radius: 6px; }
  .lb-details { margin-top: 10px; background: #232d3f; border-radius: 8px; padding: 12px 14px; font-size: 0.85rem; }
  .lb-counter { text-align: center; color: #9fb0c7; font-size: 0.8rem; margin-top: 8px; }
  .lb-close, .lb-nav { position: absolute; background: rgba(73,101,150,0.7); color: #fff; border: none; cursor: pointer; z-index: 101; }
  .lb-close { top: 12px; right: 12px; width: 40px; height: 40px; border-radius: 50%; font-size: 1.1rem; }
  .lb-nav { top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; font-size: 1.6rem; line-height: 1; }
  .lb-prev { left: 10px; }
  .lb-next { right: 10px; }
  .lb-close:hover, .lb-nav:hover { background: #007bff; }
  .lb-actions { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .copy-btn { background: rgba(0,123,255,0.92); color: #fff;
    border: none; border-radius: 6px; padding: 8px 12px; font-size: 0.85rem; cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
  .copy-btn:hover { background: #0069d9; }
  .download-btn { background: rgba(23,162,184,0.92); }
  .download-btn:hover { background: #138496; }
  .copy-btn.copied { background: #28a745; }
  .detail-row { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .detail-row:last-child { border-bottom: none; }
  .detail-label { color: #9fb0c7; min-width: 150px; flex-shrink: 0; }
  .detail-value { color: #f8f9fa; word-break: break-word; }
  @media (max-width: 600px) {
    body { padding: 6px; }
    .catalog { grid-template-columns: repeat(2, 1fr); gap: 4px; }
    .detail-label { min-width: 110px; }
  }
</style>
</head>
<body>
  <header>
    <h1>📷 Catálogo Fotográfico GDR-CAM</h1>
    <p>Generado: ${escapeHtml(generated)} · ${thumbParts.length} foto(s) · Toca una foto para ver detalles</p>
  </header>
  <div class="search-bar">
    <input type="search" id="search1" placeholder="🔍 Buscar (frente, actividad, fecha...)" oninput="filterThumbs()">
    <input type="search" id="search2" placeholder="🔍 Buscar..." oninput="filterThumbs()">
  </div>
  <p class="search-count" id="search-count"></p>
  <div class="catalog">
`;

    const foot = `  </div>
  <div id="lightbox" class="lightbox" hidden>
    <button class="lb-close" onclick="closeLightbox()">✕</button>
    <button class="lb-nav lb-prev" onclick="navLightbox(-1)">‹</button>
    <button class="lb-nav lb-next" onclick="navLightbox(1)">›</button>
    <div class="lb-content">
      <div class="lb-img-wrap">
        <img id="lb-img" src="" alt="">
        <div class="lb-actions">
          <button class="copy-btn" onclick="copyCardImage(this)">📋 Copiar imagen</button>
          <button class="copy-btn download-btn" onclick="downloadCardImage(this)">⬇ Descargar</button>
        </div>
      </div>
      <div class="lb-counter" id="lb-counter"></div>
      <div class="details lb-details" id="lb-details"></div>
    </div>
  </div>
<script>
var thumbs = Array.prototype.slice.call(document.querySelectorAll('.thumb'));
var visibleThumbs = thumbs.slice();
var currentIdx = 0;
var lightbox = document.getElementById('lightbox');
var lbImg = document.getElementById('lb-img');
var lbDetails = document.getElementById('lb-details');
var lbCounter = document.getElementById('lb-counter');
var searchCount = document.getElementById('search-count');

// accent-insensitive normalization (búscar == buscar)
function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filterThumbs() {
  var q1 = norm(document.getElementById('search1').value.trim());
  var q2 = norm(document.getElementById('search2').value.trim());
  visibleThumbs = [];
  thumbs.forEach(function (t) {
    var text = norm(t.textContent);
    var show = (!q1 || text.indexOf(q1) !== -1) && (!q2 || text.indexOf(q2) !== -1);
    t.style.display = show ? '' : 'none';
    if (show) visibleThumbs.push(t);
  });
  searchCount.textContent = (q1 || q2) ? visibleThumbs.length + ' de ' + thumbs.length + ' foto(s)' : '';
}

thumbs.forEach(function (t) {
  t.addEventListener('click', function () { openLightbox(visibleThumbs.indexOf(t)); });
});

function openLightbox(idx) {
  if (idx < 0 || idx >= visibleThumbs.length) return;
  currentIdx = idx;
  var t = visibleThumbs[idx];
  lbImg.src = t.querySelector('img').src;
  lbDetails.innerHTML = t.querySelector('.details').innerHTML;
  lbCounter.textContent = (idx + 1) + ' / ' + visibleThumbs.length;
  lightbox.dataset.filename = t.dataset.filename || '';
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
}
function navLightbox(delta) {
  if (!visibleThumbs.length) return;
  openLightbox((currentIdx + delta + visibleThumbs.length) % visibleThumbs.length);
}
lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', function (e) {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navLightbox(-1);
  if (e.key === 'ArrowRight') navLightbox(1);
});

async function copyCardImage(btn) {
  // Remember the label once so repeated clicks don't keep the feedback text
  var original = btn.dataset.label || (btn.dataset.label = btn.textContent);
  try {
    if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('Clipboard API no disponible');
    }
    var img = lbImg;
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; });
    }
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
    if (!blob) throw new Error('No se pudo generar la imagen');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    btn.textContent = '✓ Copiada';
    btn.classList.add('copied');
  } catch (e) {
    btn.textContent = '⚠ Clic derecho > Copiar imagen';
  }
  setTimeout(function () { btn.textContent = original; btn.classList.remove('copied'); }, 2500);
}

// Saves the image shown in the lightbox (the copy embedded in this catalog)
function downloadCardImage(btn) {
  // Remember the label once so repeated clicks don't keep the feedback text
  var original = btn.dataset.label || (btn.dataset.label = btn.textContent);
  try {
    var parts = lbImg.src.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bin = atob(parts[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    var a = document.createElement('a');
    a.href = url;
    a.download = lightbox.dataset.filename || 'foto.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    btn.textContent = '✓ Descargada';
    btn.classList.add('copied');
  } catch (e) {
    btn.textContent = '⚠ Mantén pulsada la imagen > Guardar';
  }
  setTimeout(function () { btn.textContent = original; btn.classList.remove('copied'); }, 2500);
}
</scr` + `ipt>
</body>
</html>`;

    return new Blob([head, ...thumbParts, foot], { type: 'text/html' });
}

// Wrapper to handle Worker communication as a Promise with Timeout.
// Resolves with { processedBlob, catalogBlob }
function processImageInWorker(id, imageBlob) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (workerPromises.has(id)) {
                workerPromises.delete(id);
                reject(new Error("Worker timed out"));
            }
        }, 15000); // 15 second timeout per image

        workerPromises.set(id, {
            resolve: (result) => { clearTimeout(timeout); resolve(result); },
            reject: (err) => { clearTimeout(timeout); reject(err); }
        });

        // Blobs are passed by reference, the photo bytes are not copied
        imageProcessorWorker.postMessage({ id, imageBlob });
    });
}

function getPhotoFromDB(id) {
    return new Promise((resolve, reject) => {
        if (!appState.db) return reject("Database not initialized");
        const transaction = appState.db.transaction(['photos'], 'readonly');
        const store = transaction.objectStore('photos');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

function updateGalleryButtons() {
    const selected = document.querySelectorAll('.gallery-checkbox:checked').length;
    const total = document.querySelectorAll('.gallery-checkbox').length;
    
    elements.downloadSelectedBtn.disabled = selected === 0;
    elements.deleteSelectedBtn.disabled = selected === 0;
    
    if (elements.selectAllBtn) {
        elements.selectAllBtn.textContent = (selected === total && total > 0) ? 'Ninguno' : 'Todos';
    }
}

// --- Standard Application Logic ---

async function loadWorkFronts() {
    try {
        // Use Supabase client with offline-first strategy
        await SUPABASE_CLIENT.loadDataWithCache((data) => {
            // Update work fronts select
            const workFrontSelect = document.getElementById('work-front');
            const otherOption = workFrontSelect.querySelector('option[value="otro"]');
            
            // Clear existing options except 'otro' and default
            const optionsToRemove = Array.from(workFrontSelect.options).filter(opt => opt.value !== "" && opt.value !== "otro");
            optionsToRemove.forEach(opt => opt.remove());

            // Add work fronts from data
            if (data.frentes && data.frentes.length > 0) {
                data.frentes.forEach(front => {
                    const option = document.createElement('option');
                    option.value = front;
                    option.textContent = front;
                    workFrontSelect.insertBefore(option, otherOption);
                });
            }

            populateWorkFrontOptions();
            
            // Update activities
            if (data.actividades && data.actividades.length > 0) {
                populateActivityList(data.actividades);
            }
            
            // Update coronamientos
            populateCoronamientos(data.coronamientos || []);
            
            console.log(`Data loaded from ${data.source}:`, 
                (data.frentes || []).length, 'frentes,', 
                (data.actividades || []).length, 'actividades,',
                (data.coronamientos || []).length, 'coronamientos');
        });
        
    } catch (error) {
        console.error('Could not load work fronts:', error);
        showStatus('Error cargando frentes. Usando cache local.', 'warning');
    }
}

function populateCoronamientos(coronamientos) {
    const select = document.getElementById('coronation');
    if (!select) return;
    
    // Clear existing options except the placeholder
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (placeholder) {
        select.appendChild(placeholder);
    } else {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Seleccione una opción';
        select.appendChild(defaultOption);
    }
    
    coronamientos.forEach(nombre => {
        const option = document.createElement('option');
        option.value = nombre;
        option.textContent = nombre;
        select.appendChild(option);
    });
}

// Function to update work fronts from admin panel changes
window.updateWorkFrontsFromAdmin = async function(data) {
    // Re-load the work fronts with the new data
    const workFrontSelect = document.getElementById('work-front');
    const otherOption = workFrontSelect.querySelector('option[value="otro"]');
    
    // Clear existing options except 'otro' and default
    const optionsToRemove = Array.from(workFrontSelect.options).filter(opt => opt.value !== "" && opt.value !== "otro");
    optionsToRemove.forEach(opt => opt.remove());

    // Add work fronts from data
    if (data.frentes && data.frentes.length > 0) {
        data.frentes.forEach(front => {
            const option = document.createElement('option');
            option.value = front;
            option.textContent = front;
            workFrontSelect.insertBefore(option, otherOption);
        });
    }

    populateWorkFrontOptions();
    
    // Update activities
    if (data.actividades && data.actividades.length > 0) {
        populateActivityList(data.actividades);
    }
    
    // Update coronamientos
    populateCoronamientos(data.coronamientos || []);
};

// Initialize connection monitor UI
function initConnectionMonitor() {
    const statusBtn = document.getElementById('connection-status-btn');
    const statusIcon = document.getElementById('connection-icon');
    
    if (!statusBtn || !statusIcon) return;
    
    // Update connection status periodically
    const updateStatus = async () => {
        const quality = await CONNECTION_MONITOR.checkConnectionQuality();
        const visuals = CONNECTION_MONITOR.getStatusVisuals(quality.status);
        
        statusIcon.textContent = visuals.icon;
        statusBtn.title = quality.message;
        statusBtn.style.color = visuals.color;
    };
    
    // Update immediately and then every 30 seconds
    updateStatus();
    setInterval(updateStatus, 30000);
    
    // Also update on online/offline events
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    // Click to show detailed status
    statusBtn.addEventListener('click', async () => {
        const quality = await CONNECTION_MONITOR.checkConnectionQuality();
        showStatus(
            `${quality.message}${quality.ping ? ` (${quality.ping}ms)` : ''}`,
            quality.canSync ? 'success' : 'warning'
        );
    });
}

// Initialize admin panel
function initAdminPanel() {
    console.log('Initializing admin panel...');
    const adminBtn = document.getElementById('admin-panel-btn');
    console.log('Admin button found:', adminBtn);
    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            console.log('Admin button clicked');
            if (typeof ADMIN_PANEL !== 'undefined') {
                ADMIN_PANEL.toggle();
            } else {
                console.error('ADMIN_PANEL not loaded');
                showStatus('Error: Panel de admin no cargado', 'error');
            }
        });
    } else {
        console.error('Admin button not found in DOM');
    }
}

function populateActivityList(activities) {
    const container = document.getElementById('activity-list');
    if (!container) return;
    container.innerHTML = '';
    
    activities.forEach(activity => {
        const div = createActivityItem(activity, activity);
        container.appendChild(div);
    });

    // Add "Otra" option
    const otherDiv = createActivityItem('Otra', 'otra-activity');
    container.appendChild(otherDiv);

    // Setup listener for "Otra"
    const otherCheckbox = otherDiv.querySelector('input');
    const otherInputGroup = document.getElementById('other-activity-group');
    
    otherCheckbox.addEventListener('change', () => {
        if (otherCheckbox.checked) {
            otherInputGroup.classList.remove('hidden');
        } else {
            otherInputGroup.classList.add('hidden');
        }
    });
}

function createActivityItem(labelText, value) {
    const div = document.createElement('div');
    div.className = 'activity-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.id = `act-${value.replace(/\s+/g, '-').toLowerCase()}`;
    
    const span = document.createElement('span');
    span.textContent = labelText;
    
    div.appendChild(checkbox);
    div.appendChild(span);
    
    // Make the whole div clickable
    div.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    
    return div;
}

function loadPersistentData() {
    try {
        const savedData = localStorage.getItem('gdrCamFormData');
        if (savedData) {
            const formData = JSON.parse(savedData);
            if (formData.workFront) {
                const workFrontSelect = document.getElementById('work-front');
                const optionExists = Array.from(workFrontSelect.options).some(opt => opt.value === formData.workFront);

                if (optionExists) {
                    workFrontSelect.value = formData.workFront;
                    elements.workFrontSearch.value = workFrontSelect.options[workFrontSelect.selectedIndex].text;
                } else {
                    workFrontSelect.value = 'otro';
                    elements.otherWorkFrontGroup.classList.remove('hidden');
                    elements.otherWorkFrontInput.value = formData.workFront;
                    elements.workFrontSearch.value = formData.workFront;
                }
            }
            document.getElementById('coronation').value = formData.coronation || '';
            document.getElementById('observation-category').value = formData.observationCategory || '';
            
            // Restore activities
            if (formData.activityPerformed) {
                const savedActivitiesStr = formData.activityPerformed;
                const allCheckboxes = Array.from(document.querySelectorAll('#activity-list input[type="checkbox"]'));
                const savedParts = savedActivitiesStr.split(', ').map(s => s.trim());
                
                let foundCustom = false;
                let customText = [];

                savedParts.forEach(part => {
                    const cb = allCheckboxes.find(c => c.value === part && c.value !== 'otra-activity');
                    if (cb) {
                        cb.checked = true;
                    } else {
                        // If it's not a standard activity, it's likely custom
                        foundCustom = true;
                        customText.push(part);
                    }
                });

                if (foundCustom) {
                    const otherCb = document.querySelector('input[value="otra-activity"]');
                    if (otherCb) {
                        otherCb.checked = true;
                        document.getElementById('other-activity-group').classList.remove('hidden');
                        document.getElementById('other-activity').value = customText.join(', ');
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error loading form data:", e);
    }
}

function attachEventListeners() {
    elements.takePhotoBtn.addEventListener('click', () => elements.cameraInput.click());
    elements.cameraInput.addEventListener('change', handleNativeCameraCapture);
    elements.saveMetadataBtn.addEventListener('click', handleSaveMetadata);
    elements.saveWithoutFormBtn.addEventListener('click', handleSaveWithoutForm);

    const workFrontSelect = document.getElementById('work-front');
    workFrontSelect.addEventListener('change', () => {
        if (workFrontSelect.value === 'otro') {
            elements.otherWorkFrontGroup.classList.remove('hidden');
        } else {
            elements.otherWorkFrontGroup.classList.add('hidden');
        }
    });

    setupSearchableSelect();
    setupFormInteractionLogic();

    elements.newCaptureBtn.addEventListener('click', newCapture);
    elements.downloadPhotoBtn.addEventListener('click', handleDownload);
    
    elements.rotateLeftBtn.addEventListener('click', () => rotateImage(-90));
    elements.rotateRightBtn.addEventListener('click', () => rotateImage(90));
    
    setupMetadataModal();

    // Gallery Listeners
    if (elements.selectAllBtn) {
        elements.selectAllBtn.addEventListener('click', () => {
            const allCheckboxes = document.querySelectorAll('.gallery-checkbox');
            const anyUnchecked = Array.from(allCheckboxes).some(cb => !cb.checked);
            
            allCheckboxes.forEach(cb => {
                cb.checked = anyUnchecked;
                cb.parentElement.parentElement.classList.toggle('selected', anyUnchecked);
            });
            updateGalleryButtons();
        });
    }

    if (elements.refreshGalleryBtn) {
        elements.refreshGalleryBtn.addEventListener('click', () => {
             showStatus('Actualizando galería...', 'info');
             loadGallery(true);
        });
    }

    if (elements.deleteSelectedBtn) elements.deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.addEventListener('click', downloadSelectedPhotos);

    // Edit metadata modal listeners
    document.getElementById('close-edit-modal').addEventListener('click', closeEditMetadataModal);
    document.getElementById('cancel-edit-btn').addEventListener('click', closeEditMetadataModal);
    document.getElementById('save-edit-btn').addEventListener('click', saveEditedMetadata);
    document.getElementById('edit-work-front').addEventListener('change', () => {
        const group = document.getElementById('edit-other-work-front-group');
        if (document.getElementById('edit-work-front').value === 'otro') {
            group.classList.remove('hidden');
        } else {
            group.classList.add('hidden');
        }
    });
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('edit-metadata-modal');
        if (e.target === modal) closeEditMetadataModal();
    });
}

function handleNativeCameraCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    showStatus('Procesando...', 'success');
    
    // Al capturar una nueva foto, reiniciamos la "mejor ubicación"
    // para forzar al sistema a obtener la ubicación más fresca de este punto.
    appState.bestLocation = null;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => processCapturedImage(img);
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function processCapturedImage(img) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        let imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);

        try {
            imageDataUrl = await correctImageOrientation(imageDataUrl);
        } catch (e) {}

        try {
            imageDataUrl = await cropToAspectRatio(imageDataUrl);
        } catch (e) {}

        appState.capturedPhotoDataUrl = imageDataUrl;
        elements.cameraSection.classList.add('hidden');
        elements.formSection.classList.remove('hidden');
        updateFormGpsDisplay();

    } catch (error) {
        console.error(error);
        showStatus('Error al procesar.', 'error');
    }
}

function cropToAspectRatio(imageDataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const ow = img.width, oh = img.height;
            const targetRatio = (oh > ow) ? 9/16 : 16/9;
            const currentRatio = ow / oh;

            if (Math.abs(currentRatio - targetRatio) < 0.01) {
                resolve(imageDataUrl); return;
            }

            let sx, sy, sw, sh;
            if (currentRatio > targetRatio) {
                sh = oh; sw = oh * targetRatio; sx = (ow - sw)/2; sy = 0;
            } else {
                sw = ow; sh = ow / targetRatio; sx = 0; sy = (oh - sh)/2;
            }

            const cvs = document.createElement('canvas');
            cvs.width = sw; cvs.height = sh;
            cvs.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            resolve(cvs.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = imageDataUrl;
    });
}

function startGpsSystem() {
    if (!navigator.geolocation) {
        if(elements.gpsStatus) elements.gpsStatus.textContent = 'Sin GPS';
        elements.takePhotoBtn.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => { updateLocationState(pos); elements.takePhotoBtn.disabled = false; },
        (err) => { handleGpsError(err); elements.takePhotoBtn.disabled = false; },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );

    appState.locationWatcher = navigator.geolocation.watchPosition(
        updateLocationState,
        (e) => console.warn(e.message),
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
    );
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio de la Tierra en metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function updateLocationState(position) {
    const newPos = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp
    };
    
    appState.currentLocation = newPos;

    // Umbral de movimiento para considerar que estamos en un "nuevo punto" (metros)
    const movementThreshold = 15; 
    let distanceMoved = 0;
    
    if (appState.bestLocation) {
        distanceMoved = getDistance(
            appState.bestLocation.latitude, appState.bestLocation.longitude,
            newPos.latitude, newPos.longitude
        );
    }

    // Actualizar ubicación óptima si:
    // 1. No hay ubicación previa
    // 2. El usuario se ha movido significativamente (nuevo punto)
    // 3. La precisión es mejor que la actual
    if (!appState.bestLocation || distanceMoved > movementThreshold || (newPos.accuracy < appState.bestLocation.accuracy)) {
        if (distanceMoved > movementThreshold) {
            console.log(`Movimiento detectado (${Math.round(distanceMoved)}m). Reiniciando mejor ubicación.`);
        }
        appState.bestLocation = { ...newPos };
    }

    if (elements.gpsStatus) {
        elements.gpsStatus.textContent = `GPS: ±${Math.round(appState.bestLocation.accuracy)}m`;
        elements.gpsStatus.style.color = '#28a745';
    }
    updateFormGpsDisplay();
}

function updateFormGpsDisplay() {
    const display = document.getElementById('gps-coords');
    if (display && appState.bestLocation && !appState.isFormInteractionActive) {
        display.value = `${appState.bestLocation.latitude.toFixed(7)}, ${appState.bestLocation.longitude.toFixed(7)}`;
    }
}

function handleGpsError(error) {
    if (elements.gpsStatus) {
        elements.gpsStatus.textContent = 'Error GPS';
        elements.gpsStatus.style.color = '#dc3545';
    }
}

function handleSaveMetadata() {
    const workFront = document.getElementById('work-front').value === 'otro' ? 
                      elements.otherWorkFrontInput.value.trim() : 
                      document.getElementById('work-front').value;
    
    // Get selected activities
    const checkboxes = document.querySelectorAll('#activity-list input[type="checkbox"]:checked');
    let selectedActivities = [];
    
    checkboxes.forEach(cb => {
        if (cb.value === 'otra-activity') {
            const customText = document.getElementById('other-activity').value.trim();
            if (customText) {
                selectedActivities.push(customText);
            }
        } else {
            selectedActivities.push(cb.value);
        }
    });
    
    if (!workFront || !document.getElementById('coronation').value || !document.getElementById('observation-category').value) {
        showStatus('Complete el formulario.', 'error'); return;
    }
    
    const metadata = {
        workFront,
        coronation: document.getElementById('coronation').value,
        activityPerformed: selectedActivities.join(', '),
        observationCategory: document.getElementById('observation-category').value,
        location: appState.bestLocation || appState.currentLocation,
        timestamp: new Date().toLocaleString()
    };

    // Guardar datos para la siguiente captura (EXCLUYENDO actividades)
    const dataToPersist = { ...metadata };
    delete dataToPersist.activityPerformed;
    localStorage.setItem('gdrCamFormData', JSON.stringify(dataToPersist));
    
    elements.saveMetadataBtn.innerHTML = '<span class="loading"></span> Guardando...';
    elements.saveMetadataBtn.disabled = true;
    
    addMetadataAndSave(appState.capturedPhotoDataUrl, metadata);
}

function handleSaveWithoutForm() {
    const metadata = {
        location: appState.bestLocation || appState.currentLocation,
        timestamp: new Date().toLocaleString()
    };
    
    elements.saveWithoutFormBtn.innerHTML = '<span class="loading"></span> Guardando...';
    elements.saveWithoutFormBtn.disabled = true;
    
    addMetadataAndSave(appState.capturedPhotoDataUrl, metadata);
}

// --- ENHANCED METADATA LOGIC FROM ADAPTED CODE ---
async function addMetadataAndSave(imageDataUrl, metadata) {
    console.log("Starting addMetadataAndSave with enhanced logic");

    try {
        const imageWithExifOnly = imageDataUrl; 
        
        if (typeof piexif !== 'undefined' && piexif.dump) {
            let exifObj = {"0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "thumbnail": null};
            
            // 1. Enhanced UserComment Encoding
            if (metadata.workFront || metadata.coronation || metadata.activityPerformed || metadata.observationCategory) {
                let userComment;
                if (piexif.helper && piexif.helper.encodeToUnicode) {
                    try {
                        userComment = piexif.helper.encodeToUnicode(JSON.stringify(metadata));
                    } catch (encodingError) {
                        console.warn("Unicode encoding failed, using fallback:", encodingError);
                        userComment = "ASCII\0" + JSON.stringify(metadata);
                    }
                } else {
                    userComment = "ASCII\0" + JSON.stringify(metadata);
                }
                exifObj["Exif"][piexif.ExifIFD.UserComment] = userComment;
            }

            // 2. Enhanced GPS Data
            if (metadata.location) {
                console.log("Adding GPS data with enhanced precision...");
                const lat = metadata.location.latitude;
                const lng = metadata.location.longitude;
                
                const latRef = lat >= 0 ? "N" : "S";
                const lngRef = lng >= 0 ? "E" : "W";
                const absLat = Math.abs(lat);
                const absLng = Math.abs(lng);

                // High precision calculation matching app22.js
                const latDeg = Math.floor(absLat);
                const latMinDecimal = (absLat - latDeg) * 60;
                const latMin = Math.floor(latMinDecimal);
                const latSec = (latMinDecimal - latMin) * 60;
                
                const lngDeg = Math.floor(absLng);
                const lngMinDecimal = (absLng - lngDeg) * 60;
                const lngMin = Math.floor(lngMinDecimal);
                const lngSec = (lngMinDecimal - lngMin) * 60;

                exifObj["GPS"] = {
                    [piexif.GPSIFD.GPSVersionID]: [2, 2, 0, 0],
                    [piexif.GPSIFD.GPSLatitudeRef]: latRef,
                    [piexif.GPSIFD.GPSLatitude]: [
                        [Math.round(latDeg), 1], 
                        [Math.round(latMin), 1], 
                        [Math.round(latSec * 1000000), 1000000]
                    ],
                    [piexif.GPSIFD.GPSLongitudeRef]: lngRef,
                    [piexif.GPSIFD.GPSLongitude]: [
                        [Math.round(lngDeg), 1], 
                        [Math.round(lngMin), 1], 
                        [Math.round(lngSec * 1000000), 1000000]
                    ]
                };

                // Altitude
                if (metadata.location.altitude !== null && metadata.location.altitude !== undefined) {
                    const alt = Math.abs(metadata.location.altitude);
                    const altRef = metadata.location.altitude >= 0 ? 0 : 1;
                    exifObj["GPS"][piexif.GPSIFD.GPSAltitudeRef] = altRef;
                    exifObj["GPS"][piexif.GPSIFD.GPSAltitude] = [Math.round(alt * 1000000), 1000000];
                }

                // Accuracy (DOP)
                if (metadata.location.accuracy !== undefined) {
                    const accuracy = metadata.location.accuracy;
                    exifObj["GPS"][piexif.GPSIFD.GPSDOP] = [Math.round(accuracy * 100), 100];
                }

                // Speed
                if (metadata.location.speed !== null && metadata.location.speed !== undefined) {
                    exifObj["GPS"][piexif.GPSIFD.GPSSpeedRef] = "K";
                    const speedKmh = metadata.location.speed * 3.6;
                    exifObj["GPS"][piexif.GPSIFD.GPSSpeed] = [Math.round(speedKmh * 1000000), 1000000];
                }

                // Date Stamp
                if (metadata.location.timestamp) {
                    const date = new Date(metadata.location.timestamp);
                    const gpsDate = date.getFullYear() + ":" + 
                        String(date.getMonth() + 1).padStart(2, '0') + ":" + 
                        String(date.getDate()).padStart(2, '0');
                    
                    exifObj["GPS"][piexif.GPSIFD.GPSDateStamp] = gpsDate;
                    
                    exifObj["GPS"][piexif.GPSIFD.GPSTimeStamp] = [
                        [date.getHours(), 1],
                        [date.getMinutes(), 1],
                        [date.getSeconds(), 1]
                    ];
                }
            }

            const now = new Date();
            const dateStr = now.getFullYear() + ":" + 
                String(now.getMonth() + 1).padStart(2, '0') + ":" + 
                String(now.getDate()).padStart(2, '0') + " " +
                String(now.getHours()).padStart(2, '0') + ":" + 
                String(now.getMinutes()).padStart(2, '0') + ":" + 
                String(now.getSeconds()).padStart(2, '0');
            
            exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = dateStr;
            exifObj["0th"][piexif.ImageIFD.DateTime] = dateStr;

            const exifBytes = piexif.dump(exifObj);
            const imageWithExif = piexif.insert(exifBytes, imageWithExifOnly);
            
            appState.photoWithMetadata = imageWithExif;
            appState.originalPhotoWithMetadata = imageWithExif;
            elements.photoPreview.src = imageWithExif;
            
            // Auto rotate 90 degrees LEFT per requirement
            await rotateImage(0); 

            // SAVE TO DB AUTOMATICALLY
            await savePhotoToDB(appState.photoWithMetadata, metadata);
            
            elements.formSection.classList.add('hidden');
            elements.resultSection.classList.remove('hidden');
            showStatus('¡Foto guardada en Galería!', 'success');

        } else {
            throw new Error("Librería piexif no disponible");
        }

    } catch (err) {
        console.error(err);
        const msg = err.message || (typeof err === 'string' ? err : 'Error desconocido al guardar');
        showStatus('Error: ' + msg, 'error');
    } finally {
        resetButtons();
    }
}

function resetButtons() {
    if(elements.saveMetadataBtn) { elements.saveMetadataBtn.innerHTML = 'Guardar Foto con Metadatos'; elements.saveMetadataBtn.disabled = false; }
    if(elements.saveWithoutFormBtn) { elements.saveWithoutFormBtn.innerHTML = 'Guardar Foto sin Formulario'; elements.saveWithoutFormBtn.disabled = false; }
}

function rotateImage(angle) {
    return new Promise((resolve, reject) => {
        if (!appState.photoWithMetadata) return resolve();

        const img = new Image();
        img.onload = function() {
            try {
                const exifObj = piexif.load(appState.photoWithMetadata);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
                    canvas.width = img.height; canvas.height = img.width;
                } else {
                    canvas.width = img.width; canvas.height = img.height;
                }

                ctx.save();
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(angle * Math.PI / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                ctx.restore();

                const rotatedImage = canvas.toDataURL('image/jpeg', 0.92);
                const exifBytes = piexif.dump(exifObj);
                const imageWithExif = piexif.insert(exifBytes, rotatedImage);
                
                elements.photoPreview.src = imageWithExif;
                appState.photoWithMetadata = imageWithExif;
                resolve();
            } catch (e) {
                console.error("Error in rotateImage:", e);
                reject(e);
            }
        };
        img.onerror = (e) => reject(new Error("Error loading image to rotate"));
        img.src = appState.photoWithMetadata;
    });
}

async function handleDownload() {
    if (!appState.photoWithMetadata) return;
    elements.downloadPhotoBtn.innerHTML = '<span class="loading"></span>...';
    elements.downloadPhotoBtn.disabled = true;

    const imageToSave = await addTimestampAndLogoToImage(appState.photoWithMetadata);
    saveAs(dataURLtoBlob(imageToSave), `GDR-CAM-${new Date().getTime()}.jpg`);
    
    elements.downloadPhotoBtn.innerHTML = 'Guardar en Galería';
    elements.downloadPhotoBtn.disabled = false;
}

// Helper to convert DataURL to Blob for FileSaver
// Kept globally as it's a utility function used by both main thread and implicitly by worker's logic.
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

// --- ENHANCED OVERLAY LOGIC FROM ADAPTED CODE ---
// This function remains in app.js for single photo download and immediate preview.
// For bulk downloads, the worker version will be used.
function addTimestampAndLogoToImage(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); // Use standard canvas on main thread
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw the image on the canvas
            ctx.drawImage(img, 0, 0);
            
            // Load existing EXIF to preserve it
            const exifObj = piexif.load(imageUrl);
            
            const drawOverlays = () => {
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                const padding = Math.min(25, canvasWidth * 0.02, canvasHeight * 0.02); 

                const fontSize = Math.min(80, Math.max(20, Math.floor(canvasHeight * 0.04))); 
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                const centerX = canvasWidth / 2;
                // Position for GPS coordinates (bottom)
                const coordsY = canvasHeight - fontSize * 0.8;
                // Position for Arrow (above coordinates)
                const arrowY = coordsY - fontSize - (padding / 2);
                
                let gpsInfo = 'N'; 
                
                if (exifObj.GPS) {
                    let lat = null, lng = null;
                    let latRef = null, lngRef = null;
                    
                    if (exifObj.GPS[piexif.GPSIFD.GPSLatitude]) {
                        const gpsLat = exifObj.GPS[piexif.GPSIFD.GPSLatitude];
                        if (Array.isArray(gpsLat) && gpsLat.length === 3) {
                            const deg = gpsLat[0][0] / gpsLat[0][1];
                            const min = gpsLat[1][0] / gpsLat[1][1];
                            const sec = gpsLat[2][0] / gpsLat[2][1];
                            lat = deg + (min / 60) + (sec / 3600);
                        }
                    }
                    
                    if (exifObj.GPS[piexif.GPSIFD.GPSLongitude]) {
                        const gpsLng = exifObj.GPS[piexif.GPSIFD.GPSLongitude];
                        if (Array.isArray(gpsLng) && gpsLng.length === 3) {
                            const deg = gpsLng[0][0] / gpsLng[0][1];
                            const min = gpsLng[1][0] / gpsLng[1][1];
                            const sec = gpsLng[2][0] / gpsLng[2][1];
                            lng = deg + (min / 60) + (sec / 3600);
                        }
                    }
                    
                    latRef = exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef];
                    lngRef = exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef];
                    
                    if (lat !== null && lng !== null && latRef && lngRef) {
                        gpsInfo = `N ${Math.abs(lat).toFixed(6)}° ${latRef}, ${Math.abs(lng).toFixed(6)}° ${lngRef}`;
                        
                        if (exifObj.GPS[piexif.GPSIFD.GPSDOP]) {
                            const dop = exifObj.GPS[piexif.GPSIFD.GPSDOP];
                            if (Array.isArray(dop) && dop[1] !== 0) {
                                const accuracy = (dop[0] / dop[1]).toFixed(1);
                                gpsInfo += ` (±${accuracy}m)`;
                            }
                        }
                    }
                }
                
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = Math.max(1, fontSize / 20); // Dynamic line width
                
                // Draw Arrow
                ctx.strokeText('⬆', centerX, arrowY);
                ctx.fillText('⬆', centerX, arrowY);
                
                // Draw GPS Info
                ctx.strokeText(gpsInfo, centerX, coordsY);
                ctx.fillText(gpsInfo, centerX, coordsY);
                
                const timestamp = exifObj['Exif'] && exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] 
                    ? exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] 
                    : new Date().toLocaleString();

                ctx.textAlign = 'right';
                const timestampX = canvasWidth - padding;
                const timestampY = canvasHeight - padding;
                
                ctx.strokeText(timestamp, timestampX, timestampY);
                ctx.fillText(timestamp, timestampX, timestampY);

                const imageWithText = canvas.toDataURL('image/jpeg', 0.92);
                
                const exifBytes = piexif.dump(exifObj);
                const imageWithExif = piexif.insert(exifBytes, imageWithText);
                
                resolve(imageWithExif);
            };
            
            drawOverlays();
        };
        
        img.onerror = function() {
            reject(new Error('Error loading image'));
        };
        
        img.src = imageUrl;
    });
}

function newCapture() {
    elements.resultSection.classList.add('hidden');
    elements.cameraSection.classList.remove('hidden');
    elements.cameraInput.value = '';

    // Limpiar selección de actividades y campo "otro"
    document.querySelectorAll('#activity-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    const otherActivityInput = document.getElementById('other-activity');
    if (otherActivityInput) otherActivityInput.value = '';
    const otherActivityGroup = document.getElementById('other-activity-group');
    if (otherActivityGroup) otherActivityGroup.classList.add('hidden');

    appState.bestLocation = null; // Reiniciar para asegurar captura de nueva ubicación

    loadPersistentData();
    loadGallery(); // Refresh gallery view
}

function setupSearchableSelect() {
    const searchInput = elements.workFrontSearch;
    const optionsContainer = elements.workFrontOptions;
    
    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase();
        const options = optionsContainer.getElementsByClassName('option');
        let hasVisible = false;
        for (let opt of options) {
            const visible = opt.textContent.toLowerCase().includes(term);
            opt.classList.toggle('hidden', !visible);
            if (visible) hasVisible = true;
        }
        optionsContainer.classList.toggle('hidden', !hasVisible);
    });
    
    searchInput.addEventListener('focus', () => {
        optionsContainer.classList.remove('hidden');
        Array.from(optionsContainer.children).forEach(c => c.classList.remove('hidden'));
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.searchable-select')) {
            optionsContainer.classList.add('hidden');
        }
    });
}

function populateWorkFrontOptions() {
    const select = document.getElementById('work-front');
    const container = elements.workFrontOptions;
    container.innerHTML = '';
    
    Array.from(select.options).forEach(opt => {
        if (opt.value === "") return;
        const div = document.createElement('div');
        div.className = 'option';
        div.textContent = opt.textContent;
        div.addEventListener('click', () => {
            select.value = opt.value;
            elements.workFrontSearch.value = opt.textContent;
            container.classList.add('hidden');
            select.dispatchEvent(new Event('change'));
        });
        container.appendChild(div);
    });
}

function setupFormInteractionLogic() {
    const inputs = document.querySelectorAll('#form-section input, #form-section select, #form-section textarea');
    inputs.forEach(i => {
        i.addEventListener('focus', () => appState.isFormInteractionActive = true);
        i.addEventListener('blur', () => appState.isFormInteractionActive = false);
    });
}

function setupMetadataModal() {
    const modal = document.getElementById('metadata-modal');
    const btn = document.getElementById('view-metadata');
    const close = document.querySelector('.close-button');
    const display = document.getElementById('metadata-display');
    
    btn.addEventListener('click', () => {
        if (!appState.photoWithMetadata) return;
        const exif = piexif.load(appState.photoWithMetadata);
        display.textContent = JSON.stringify(exif, null, 2);
        modal.classList.remove('hidden');
    });
    
    close.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
}

// --- Edit Metadata Modal Functions ---

function populateEditWorkFronts() {
    const select = document.getElementById('edit-work-front');
    const mainSelect = document.getElementById('work-front');
    if (!select || !mainSelect) return;
    select.innerHTML = '';
    Array.from(mainSelect.options).forEach(opt => {
        const newOpt = document.createElement('option');
        newOpt.value = opt.value;
        newOpt.textContent = opt.textContent;
        select.appendChild(newOpt);
    });
}

function populateEditCoronamientos() {
    const select = document.getElementById('edit-coronation');
    const mainSelect = document.getElementById('coronation');
    if (!select || !mainSelect) return;
    select.innerHTML = '';
    Array.from(mainSelect.options).forEach(opt => {
        const newOpt = document.createElement('option');
        newOpt.value = opt.value;
        newOpt.textContent = opt.textContent;
        select.appendChild(newOpt);
    });
}

function populateEditObservationCategories() {
    const select = document.getElementById('edit-observation-category');
    const mainSelect = document.getElementById('observation-category');
    if (!select || !mainSelect) return;
    select.innerHTML = '';
    Array.from(mainSelect.options).forEach(opt => {
        const newOpt = document.createElement('option');
        newOpt.value = opt.value;
        newOpt.textContent = opt.textContent;
        select.appendChild(newOpt);
    });
}

function populateEditActivities() {
    const container = document.getElementById('edit-activity-list');
    const mainContainer = document.getElementById('activity-list');
    if (!container || !mainContainer) return;
    container.innerHTML = '';

    Array.from(mainContainer.children).forEach(item => {
        const mainCheckbox = item.querySelector('input');
        const mainSpan = item.querySelector('span');
        if (!mainCheckbox || !mainSpan) return;

        const div = document.createElement('div');
        div.className = 'activity-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = mainCheckbox.value;
        checkbox.id = 'edit-act-' + mainCheckbox.value.replace(/\s+/g, '-').toLowerCase();

        const span = document.createElement('span');
        span.textContent = mainSpan.textContent;

        div.appendChild(checkbox);
        div.appendChild(span);

        div.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        container.appendChild(div);
    });

    const otherCheckbox = container.querySelector('input[value="otra-activity"]');
    const otherGroup = document.getElementById('edit-other-activity-group');
    if (otherCheckbox && otherGroup) {
        otherCheckbox.addEventListener('change', () => {
            if (otherCheckbox.checked) {
                otherGroup.classList.remove('hidden');
            } else {
                otherGroup.classList.add('hidden');
            }
        });
    }
}

async function openEditMetadataModal(photoId) {
    currentEditPhotoId = photoId;
    try {
        const item = await getPhotoFromDB(photoId);
        if (!item || !item.metadata) {
            showStatus('No se pudieron cargar los metadatos.', 'error');
            return;
        }

        const metadata = item.metadata;

        populateEditWorkFronts();
        populateEditCoronamientos();
        populateEditObservationCategories();
        populateEditActivities();

        const workFrontSelect = document.getElementById('edit-work-front');
        const otherWorkFrontGroup = document.getElementById('edit-other-work-front-group');
        const otherWorkFrontInput = document.getElementById('edit-other-work-front');

        const workFrontExists = Array.from(workFrontSelect.options).some(opt => opt.value === metadata.workFront);
        if (workFrontExists) {
            workFrontSelect.value = metadata.workFront || '';
            otherWorkFrontGroup.classList.add('hidden');
            otherWorkFrontInput.value = '';
        } else if (metadata.workFront) {
            workFrontSelect.value = 'otro';
            otherWorkFrontGroup.classList.remove('hidden');
            otherWorkFrontInput.value = metadata.workFront;
        } else {
            workFrontSelect.value = '';
            otherWorkFrontGroup.classList.add('hidden');
            otherWorkFrontInput.value = '';
        }

        document.getElementById('edit-coronation').value = metadata.coronation || '';
        document.getElementById('edit-observation-category').value = metadata.observationCategory || '';

        // Activities
        if (metadata.activityPerformed) {
            const activities = metadata.activityPerformed.split(', ').map(s => s.trim()).filter(Boolean);
            const checkboxes = document.querySelectorAll('#edit-activity-list input[type="checkbox"]');
            const standardValues = Array.from(checkboxes).map(cb => cb.value).filter(v => v !== 'otra-activity');
            let customActivities = [];

            checkboxes.forEach(cb => {
                if (activities.includes(cb.value)) {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
            });

            activities.forEach(act => {
                if (!standardValues.includes(act)) {
                    customActivities.push(act);
                }
            });

            if (customActivities.length > 0) {
                const otherCb = document.querySelector('#edit-activity-list input[value="otra-activity"]');
                if (otherCb) {
                    otherCb.checked = true;
                    document.getElementById('edit-other-activity-group').classList.remove('hidden');
                    document.getElementById('edit-other-activity').value = customActivities.join(', ');
                }
            } else {
                document.getElementById('edit-other-activity-group').classList.add('hidden');
                document.getElementById('edit-other-activity').value = '';
            }
        } else {
            document.querySelectorAll('#edit-activity-list input[type="checkbox"]').forEach(cb => cb.checked = false);
            document.getElementById('edit-other-activity-group').classList.add('hidden');
            document.getElementById('edit-other-activity').value = '';
        }

        document.getElementById('edit-metadata-modal').classList.remove('hidden');
    } catch (err) {
        console.error('Error opening edit modal:', err);
        showStatus('Error al abrir editor de metadatos.', 'error');
    }
}

function closeEditMetadataModal() {
    document.getElementById('edit-metadata-modal').classList.add('hidden');
    currentEditPhotoId = null;
}

async function saveEditedMetadata() {
    if (!currentEditPhotoId) return;

    const workFrontSelect = document.getElementById('edit-work-front');
    const workFront = workFrontSelect.value === 'otro' ?
        document.getElementById('edit-other-work-front').value.trim() :
        workFrontSelect.value;

    const checkboxes = document.querySelectorAll('#edit-activity-list input[type="checkbox"]:checked');
    let selectedActivities = [];
    checkboxes.forEach(cb => {
        if (cb.value === 'otra-activity') {
            const customText = document.getElementById('edit-other-activity').value.trim();
            if (customText) selectedActivities.push(customText);
        } else {
            selectedActivities.push(cb.value);
        }
    });

    if (!workFront || !document.getElementById('edit-coronation').value || !document.getElementById('edit-observation-category').value) {
        showStatus('Complete el formulario.', 'error');
        return;
    }

    try {
        const item = await getPhotoFromDB(currentEditPhotoId);
        if (!item) throw new Error('Foto no encontrada');

        const newMetadata = {
            ...item.metadata,
            workFront,
            coronation: document.getElementById('edit-coronation').value,
            activityPerformed: selectedActivities.join(', '),
            observationCategory: document.getElementById('edit-observation-category').value
        };

        let imageDataUrl = item.image instanceof Blob ? await blobToDataURL(item.image) : item.image;

        let exifObj;
        try {
            exifObj = piexif.load(imageDataUrl);
        } catch (e) {
            console.warn('Could not load EXIF, creating fresh:', e);
            exifObj = {"0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "thumbnail": null};
        }

        let userComment;
        if (piexif.helper && piexif.helper.encodeToUnicode) {
            try {
                userComment = piexif.helper.encodeToUnicode(JSON.stringify(newMetadata));
            } catch (e) {
                userComment = "ASCII\0" + JSON.stringify(newMetadata);
            }
        } else {
            userComment = "ASCII\0" + JSON.stringify(newMetadata);
        }
        exifObj["Exif"][piexif.ExifIFD.UserComment] = userComment;

        const exifBytes = piexif.dump(exifObj);
        const newImageDataUrl = piexif.insert(exifBytes, imageDataUrl);
        const newBlob = dataURLtoBlob(newImageDataUrl);

        await updatePhotoInDB(currentEditPhotoId, {
            metadata: newMetadata,
            image: newBlob
        });

        showStatus('Metadatos actualizados correctamente.', 'success');
        closeEditMetadataModal();
        loadGallery(true);
    } catch (err) {
        console.error('Error updating metadata:', err);
        showStatus('Error al actualizar metadatos: ' + err.message, 'error');
    }
}

function showStatus(msg, type) {
    const el = elements.statusMessage;
    el.textContent = msg;
    el.className = `status ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

// Load styles regarding styles.css
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'style.css';
document.head.appendChild(link);

// Init
window.addEventListener('DOMContentLoaded', init);
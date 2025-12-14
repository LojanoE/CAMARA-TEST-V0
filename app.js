// GDR-CAM Application Logic - Native Camera + Gallery Version + Enhanced Metadata

// Create a Web Worker instance for image processing
const imageProcessorWorker = new Worker('./imageProcessorWorker.js');

// Store Promises for ongoing worker tasks
const workerPromises = new Map();

imageProcessorWorker.onmessage = (event) => {
    const { id, processedBlob, error } = event.data;
    if (workerPromises.has(id)) {
        if (processedBlob) {
            workerPromises.get(id).resolve(processedBlob);
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
    db: null // IndexedDB instance
};

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
    downloadSelectedBtn: null,
    deleteSelectedBtn: null,
    galleryCount: null
};

// Initialize the application
function init() {
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
    elements.downloadSelectedBtn = document.getElementById('download-selected-btn');
    elements.deleteSelectedBtn = document.getElementById('delete-selected-btn');
    elements.galleryCount = document.getElementById('gallery-count');
    
    loadWorkFronts();
    loadPersistentData();
    attachEventListeners();
    initDB(); // Initialize Database
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js');
        });
    }
        
    startGpsSystem();
}

// --- IndexedDB Logic ---
function initDB() {
    const request = indexedDB.open('GDR_CAM_DB', 1);

    request.onerror = (event) => {
        console.error("DB Error:", event.target.errorCode);
        showStatus('Error al iniciar base de datos local', 'error');
    };

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('photos')) {
            const objectStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
            objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
    };

    request.onsuccess = (event) => {
        appState.db = event.target.result;
        loadGallery(); // Load photos when DB is ready
    };
}

function savePhotoToDB(photoDataUrl, metadata) {
    return new Promise((resolve, reject) => {
        if (!appState.db) return reject('DB not initialized');

        const transaction = appState.db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');

        const photoRecord = {
            image: photoDataUrl,
            metadata: metadata,
            timestamp: new Date().getTime(), // For sorting
            displayDate: new Date().toLocaleString()
        };

        const request = store.add(photoRecord);

        request.onsuccess = () => {
            console.log('Photo saved to DB');
            resolve();
            loadGallery(); // Refresh gallery
        };

        request.onerror = (e) => {
            console.error('Error saving to DB', e);
            reject(e);
        };
    });
}

// Pagination State
appState.galleryCursor = null; // To store the last cursor key if needed, or simply count
appState.itemsLoaded = 0;
const ITEMS_PER_PAGE = 20;

function loadGallery(reset = true) {
    if (!appState.db) return;

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
    
    // We need to skip items we've already loaded. 
    // IndexedDB openCursor doesn't support 'offset' directly easily without advance(), 
    // but advance() can be slow for huge lists. 
    // For now, simple advance() is fine for < 1000 items.

    request.onsuccess = (event) => {
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

        if (reset && !advanced && appState.itemsLoaded > 0) {
           // Should not happen if logic is correct, reset sets itemsLoaded to 0
        }

        // Check if we need to skip items (simple pagination logic)
        // Note: For better performance with huge lists, we should use key ranges, 
        // but skipping logical index is okay for this scale.
        if (appState.itemsLoaded > 0 && !advanced) {
             cursor.advance(appState.itemsLoaded);
             advanced = true;
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

    img.src = item.image;
    checkbox.dataset.id = item.id;
    div.dataset.id = item.id;

    // Selection logic
    div.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
        }
        div.classList.toggle('selected', checkbox.checked);
        updateGalleryButtons();
    });

    checkbox.addEventListener('change', () => {
        div.classList.toggle('selected', checkbox.checked);
        updateGalleryButtons();
    });

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
                // For single download, process on main thread for simplicity
                const finalImage = await addTimestampAndLogoToImage(item.image); 
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
        // Multiple files: ZIP Archive, use Web Worker SEQUENTIALLY
        showStatus(`Iniciando descarga de ${total} fotos...`, 'info');
        const zip = new JSZip();
        const checkboxArray = Array.from(checkboxes);

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

                    // Process SINGLE photo via Worker
                    const processedBlob = await processImageInWorker(currentPhotoId, item.image);
                    
                    if (processedBlob) {
                        zip.file(filename, processedBlob);
                        processed++;
                    } else {
                        console.error(`Failed to process photo ${currentPhotoId}`);
                        errors++;
                    }
                }
            } catch (e) {
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

        elements.downloadSelectedBtn.innerHTML = 'Comprimiendo ZIP...';
        showStatus('Generando archivo ZIP final...', 'info');

        await new Promise(resolve => setTimeout(resolve, 100)); // Final yield

        try {
            const content = await zip.generateAsync({
                type: "blob", 
                compression: "STORE" 
            }, (metadata) => {
                if(metadata.percent) {
                    elements.downloadSelectedBtn.innerHTML = `ZIP: ${metadata.percent.toFixed(0)}%`;
                }
            });

            const zipName = `GDR_CAM_Pack_${new Date().getTime()}.zip`;
            saveAs(content, zipName);
            
            if (errors > 0) {
                showStatus(`Descarga con advertencias: ${processed} ok, ${errors} fallos.`, 'warning');
            } else {
                showStatus('ZIP descargado correctamente.', 'success');
            }
        } catch (e) {
            console.error("Error generating ZIP:", e);
            showStatus('Error al crear el ZIP.', 'error');
        }
    }

    elements.downloadSelectedBtn.innerHTML = originalBtnText;
    elements.downloadSelectedBtn.disabled = false;
}

// Wrapper to handle Worker communication as a Promise with Timeout
function processImageInWorker(id, imageDataUrl) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (workerPromises.has(id)) {
                workerPromises.delete(id);
                reject(new Error("Worker timed out"));
            }
        }, 15000); // 15 second timeout per image

        workerPromises.set(id, { 
            resolve: (blob) => { clearTimeout(timeout); resolve(blob); },
            reject: (err) => { clearTimeout(timeout); reject(err); }
        });

        imageProcessorWorker.postMessage({ id, imageDataUrl });
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
        const response = await fetch('frentes.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const workFronts = await response.json();
        
        const workFrontSelect = document.getElementById('work-front');
        const otherOption = workFrontSelect.querySelector('option[value="otro"]');
        
        workFronts.forEach(front => {
            const option = document.createElement('option');
            option.value = front;
            option.textContent = front;
            workFrontSelect.insertBefore(option, otherOption);
        });

        populateWorkFrontOptions();
    } catch (error) {
        console.error('Could not load work fronts:', error);
    }
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
            document.getElementById('activity-performed').value = formData.activityPerformed || '';
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

    if (elements.deleteSelectedBtn) elements.deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.addEventListener('click', downloadSelectedPhotos);
}

function handleNativeCameraCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    showStatus('Procesando...', 'success');
    
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
    if (!appState.bestLocation || (newPos.accuracy < appState.bestLocation.accuracy)) {
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
    
    if (!workFront || !document.getElementById('coronation').value || !document.getElementById('observation-category').value) {
        showStatus('Complete el formulario.', 'error'); return;
    }
    
    const metadata = {
        workFront,
        coronation: document.getElementById('coronation').value,
        activityPerformed: document.getElementById('activity-performed').value,
        observationCategory: document.getElementById('observation-category').value,
        location: appState.bestLocation || appState.currentLocation,
        timestamp: new Date().toLocaleString()
    };

    localStorage.setItem('gdrCamFormData', JSON.stringify(metadata));
    
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
        showStatus('Error: ' + err.message, 'error');
    } finally {
        resetButtons();
    }
}

function resetButtons() {
    if(elements.saveMetadataBtn) { elements.saveMetadataBtn.innerHTML = 'Guardar Foto con Metadatos'; elements.saveMetadataBtn.disabled = false; }
    if(elements.saveWithoutFormBtn) { elements.saveWithoutFormBtn.innerHTML = 'Guardar Foto sin Formulario'; elements.saveWithoutFormBtn.disabled = false; }
}

async function rotateImage(angle) {
    if (!appState.photoWithMetadata) return;

    const img = new Image();
    img.onload = function() {
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
    };
    img.src = appState.photoWithMetadata;
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
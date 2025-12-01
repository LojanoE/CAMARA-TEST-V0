// GDR-CAM Application Logic - Native Camera + Gallery Version

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

function loadGallery() {
    if (!appState.db) return;

    const transaction = appState.db.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev'); // Newest first

    elements.galleryGrid.innerHTML = '';
    let count = 0;

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            renderGalleryItem(cursor.value);
            count++;
            cursor.continue();
        } else {
            elements.galleryCount.textContent = count;
            if (count === 0) {
                elements.galleryGrid.innerHTML = '<p class="empty-msg">No hay fotos guardadas aún.</p>';
            }
            updateGalleryButtons();
        }
    };
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
    
    const transaction = appState.db.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    
    let processed = 0;
    const total = checkboxes.length;

    showStatus(`Iniciando descarga de ${total} fotos...`, 'info');

    // Process sequentially to prevent browser choking and ensure order
    for (const cb of checkboxes) {
        elements.downloadSelectedBtn.innerHTML = `<span class="loading"></span> ${processed + 1}/${total}`;
        
        await new Promise((resolve) => {
            const request = store.get(Number(cb.dataset.id));
            
            request.onsuccess = async () => {
                const item = request.result;
                if (item) {
                    try {
                        // Add overlay before downloading
                        const finalImage = await addTimestampAndLogoToImage(item.image);
                        const dateStr = new Date(item.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        const filename = `GDR_${dateStr}_ID${item.id}.jpg`;
                        
                        // Trigger download
                        saveAs(dataURLtoBlob(finalImage), filename);
                    } catch (e) {
                        console.error("Error preparando imagen:", e);
                    }
                }
                // Small delay to allow the browser to handle the download event
                setTimeout(resolve, 500);
            };
            
            request.onerror = (e) => {
                console.error("Error DB:", e);
                resolve(); // Continue even if one fails
            };
        });
        
        processed++;
    }

    showStatus('Descargas completadas.', 'success');
    elements.downloadSelectedBtn.innerHTML = '<i class="fas fa-download"></i> Descargar';
    elements.downloadSelectedBtn.disabled = false;
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

async function addMetadataAndSave(imageDataUrl, metadata) {
    try {
        let exifObj = {"0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "thumbnail": null};
        
        // Basic EXIF injection (UserComment + GPS)
        if (metadata.workFront) {
            exifObj["Exif"][piexif.ExifIFD.UserComment] = "ASCII\0" + JSON.stringify(metadata);
        }
        
        if (metadata.location) {
            const lat = metadata.location.latitude;
            const lng = metadata.location.longitude;
            exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
            exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(lat);
            exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
            exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(lng);
        }

        const now = new Date();
        const dateStr = now.getFullYear() + ":" + 
            String(now.getMonth() + 1).padStart(2, '0') + ":" + 
            String(now.getDate()).padStart(2, '0') + " " +
            String(now.getHours()).padStart(2, '0') + ":" + 
            String(now.getMinutes()).padStart(2, '0') + ":" + 
            String(now.getSeconds()).padStart(2, '0');
        
        exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = dateStr;

        const exifBytes = piexif.dump(exifObj);
        const imageWithExif = piexif.insert(exifBytes, imageDataUrl);
        
        appState.photoWithMetadata = imageWithExif;
        appState.originalPhotoWithMetadata = imageWithExif;
        elements.photoPreview.src = imageWithExif;
        
        await rotateImage(-90); // Standard rotation logic

        // SAVE TO DB AUTOMATICALLY
        await savePhotoToDB(appState.photoWithMetadata, metadata);
        
        elements.formSection.classList.add('hidden');
        elements.resultSection.classList.remove('hidden');
        showStatus('Guardado en Galería.', 'success');

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
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

function addTimestampAndLogoToImage(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const exifObj = piexif.load(imageUrl);
            
            const fontSize = Math.max(20, Math.floor(canvas.height * 0.03));
            const padding = fontSize / 2;
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textBaseline = 'bottom';
            
            const timestamp = new Date().toLocaleString();
            let gpsText = "Sin GPS";
            
            // Try to decode user comment for display
            if (exifObj.Exif && exifObj.Exif[piexif.ExifIFD.UserComment]) {
                // Could parse metadata from here if needed
            }

            // Use current state location if available for simplicity, or try to parse EXIF
            // For this implementation, we'll stick to simple visual
            const loc = appState.bestLocation;
            if (loc) gpsText = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;

            ctx.textAlign = 'center';
            ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 3;
            ctx.strokeText('⬆ N', canvas.width / 2, canvas.height - padding - fontSize);
            ctx.fillText('⬆ N', canvas.width / 2, canvas.height - padding - fontSize);
            ctx.strokeText(gpsText, canvas.width / 2, canvas.height - padding);
            ctx.fillText(gpsText, canvas.width / 2, canvas.height - padding);
            
            ctx.textAlign = 'right';
            ctx.strokeText(timestamp, canvas.width - padding, canvas.height - padding);
            ctx.fillText(timestamp, canvas.width - padding, canvas.height - padding);

            const finalImage = canvas.toDataURL('image/jpeg', 0.92);
            const exifBytes = piexif.dump(exifObj);
            resolve(piexif.insert(exifBytes, finalImage));
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
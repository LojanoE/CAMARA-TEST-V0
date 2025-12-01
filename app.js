// GDR-CAM Application Logic - Native Camera Version

// Application state
const appState = {
    capturedPhotoDataUrl: null,
    photoWithMetadata: null,
    currentLocation: null,
    bestLocation: null, // Track the best GPS reading found so far
    locationWatcher: null, // Store the GPS watcher ID
    imageRotation: 0, // Track current rotation angle
    originalPhotoWithMetadata: null, // Store the original image for rotation operations
    isGpsDisplayThrottled: false, // Flag to throttle GPS display updates
    gpsDisplayThrottleTime: 5000, // Throttle GPS display updates to every 5 seconds
    isFormInteractionActive: false // Flag to pause background updates during form interaction
};

// DOM Elements
const elements = {
    cameraInput: null, // The native file input
    canvas: null, // We still use canvas for processing
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
    gpsStatus: null // New element for GPS feedback on camera screen
};

// Initialize the application
function init() {
    // Get DOM elements
    elements.cameraInput = document.getElementById('camera-input');
    elements.canvas = document.createElement('canvas'); // Off-screen canvas for processing
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
    
    // Load dynamic and persistent data
    loadWorkFronts();
    loadPersistentData();
    
    // Attach event listeners
    attachEventListeners();
    
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('ServiceWorker registrado:', registration))
                .catch(error => console.log('ServiceWorker error:', error));
        });
    }
        
    // Start GPS immediately
    startGpsSystem();
}

// Function to load work fronts from JSON file
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
        showStatus('Error al cargar la lista de frentes.', 'error');
    }
}

// Function to load persistent form data
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

// Attach all event listeners
function attachEventListeners() {
    // Camera Trigger
    elements.takePhotoBtn.addEventListener('click', () => {
        elements.cameraInput.click();
    });

    // Native Camera Input Change
    elements.cameraInput.addEventListener('change', handleNativeCameraCapture);

    // Form Actions
    elements.saveMetadataBtn.addEventListener('click', handleSaveMetadata);
    elements.saveWithoutFormBtn.addEventListener('click', handleSaveWithoutForm); // Separate handler

    // UI Logic
    const workFrontSelect = document.getElementById('work-front');
    workFrontSelect.addEventListener('change', () => {
        if (workFrontSelect.value === 'otro') {
            elements.otherWorkFrontGroup.classList.remove('hidden');
        } else {
            elements.otherWorkFrontGroup.classList.add('hidden');
        }
    });

    // Searchable Select Logic
    setupSearchableSelect();

    // Form Interaction Logic (Pause updates)
    setupFormInteractionLogic();

    // Navigation
    elements.newCaptureBtn.addEventListener('click', newCapture);
    elements.downloadPhotoBtn.addEventListener('click', handleDownload);
    
    // Rotation
    elements.rotateLeftBtn.addEventListener('click', () => rotateImage(-90));
    elements.rotateRightBtn.addEventListener('click', () => rotateImage(90));
    
    // Metadata Modal
    setupMetadataModal();
}

// Handle the file returned by the native camera
function handleNativeCameraCapture(event) {
    const file = event.target.files[0];
    if (!file) return; // User cancelled

    showStatus('Procesando imagen...', 'success');
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            processCapturedImage(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Process the captured image (resize/crop logic)
async function processCapturedImage(img) {
    try {
        // Determine orientation and dimensions
        const width = img.width;
        const height = img.height;
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Draw original
        ctx.drawImage(img, 0, 0);
        
        // Get initial Data URL
        let imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);

        // Correct Orientation (using EXIF if available in the file)
        try {
            imageDataUrl = await correctImageOrientation(imageDataUrl);
        } catch (e) {
            console.warn('Orientation correction skipped or failed', e);
        }

        // Crop to 16:9 / 9:16 Aspect Ratio (Optional, but keeps consistency)
        try {
            imageDataUrl = await cropToAspectRatio(imageDataUrl);
        } catch (e) {
            console.warn('Cropping failed', e);
        }

        appState.capturedPhotoDataUrl = imageDataUrl;

        // Update UI to show Form
        elements.cameraSection.classList.add('hidden');
        elements.formSection.classList.remove('hidden');
        
        // Update GPS display in form if we have it
        updateFormGpsDisplay();

    } catch (error) {
        console.error('Error processing image:', error);
        showStatus('Error al procesar la foto.', 'error');
    }
}

// Function to crop an image to a specific aspect ratio (16:9 or 9:16)
function cropToAspectRatio(imageDataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const originalWidth = img.width;
            const originalHeight = img.height;
            const isPortrait = originalHeight > originalWidth;
            const targetAspectRatio = isPortrait ? 9 / 16 : 16 / 9;
            const originalAspectRatio = originalWidth / originalHeight;

            if (Math.abs(originalAspectRatio - targetAspectRatio) < 0.01) {
                resolve(imageDataUrl);
                return;
            }

            let sx, sy, sWidth, sHeight;

            if (originalAspectRatio > targetAspectRatio) {
                sHeight = originalHeight;
                sWidth = originalHeight * targetAspectRatio;
                sx = (originalWidth - sWidth) / 2;
                sy = 0;
            } else {
                sWidth = originalWidth;
                sHeight = originalWidth / targetAspectRatio;
                sx = 0;
                sy = (originalHeight - sHeight) / 2;
            }

            const canvas = document.createElement('canvas');
            canvas.width = sWidth;
            canvas.height = sHeight;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => reject(new Error('Error loading image for cropping'));
        img.src = imageDataUrl;
    });
}

// GPS System
function startGpsSystem() {
    const gpsDisplay = document.getElementById('gps-coords'); // Form input
    
    if (!navigator.geolocation) {
        showStatus('Geolocalización no soportada.', 'error');
        if(elements.gpsStatus) elements.gpsStatus.textContent = 'GPS no soportado';
        elements.takePhotoBtn.disabled = false; // Allow anyway
        return;
    }

    // Initial get
    navigator.geolocation.getCurrentPosition(
        (position) => {
            updateLocationState(position);
            elements.takePhotoBtn.disabled = false; // Enable button
            showStatus('Ubicación obtenida.', 'success');
        },
        (error) => {
            handleGpsError(error);
            elements.takePhotoBtn.disabled = false; // Allow anyway
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );

    // Watcher
    appState.locationWatcher = navigator.geolocation.watchPosition(
        (position) => updateLocationState(position),
        (error) => console.warn('GPS Watch error:', error.message),
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
    );
}

function updateLocationState(position) {
    const newPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp
    };

    appState.currentLocation = newPosition;

    // Keep best accuracy
    if (!appState.bestLocation || (newPosition.accuracy && newPosition.accuracy < appState.bestLocation.accuracy)) {
        appState.bestLocation = { ...newPosition };
    }

    // Update UI
    if (elements.gpsStatus) {
        elements.gpsStatus.textContent = `GPS: ±${Math.round(appState.bestLocation.accuracy)}m`;
        elements.gpsStatus.style.color = '#28a745'; // Green
    }
    
    updateFormGpsDisplay();
}

function updateFormGpsDisplay() {
    const gpsDisplay = document.getElementById('gps-coords');
    if (gpsDisplay && appState.bestLocation && !appState.isFormInteractionActive) {
        gpsDisplay.value = `${appState.bestLocation.latitude.toFixed(7)}, ${appState.bestLocation.longitude.toFixed(7)} (±${Math.round(appState.bestLocation.accuracy)}m)`;
    }
}

function handleGpsError(error) {
    console.warn('GPS Error:', error.message);
    let msg = 'Esperando GPS...';
    if (error.code === error.PERMISSION_DENIED) msg = 'Permiso GPS denegado';
    if (elements.gpsStatus) {
        elements.gpsStatus.textContent = msg;
        elements.gpsStatus.style.color = '#dc3545'; // Red
    }
}

// Save Metadata Handler
function handleSaveMetadata() {
    const workFrontSelect = document.getElementById('work-front');
    let workFront = workFrontSelect.value;
    const coronation = document.getElementById('coronation').value;
    const activityPerformed = document.getElementById('activity-performed').value;
    const observationCategory = document.getElementById('observation-category').value;
    
    if (workFront === 'otro') {
        workFront = elements.otherWorkFrontInput.value.trim();
        if (!workFront) {
            showStatus('Especifique el frente de trabajo.', 'error');
            return;
        }
    } else if (!workFront || !coronation || !observationCategory) {
        showStatus('Complete el formulario.', 'error');
        return;
    }
    
    const bestLocationForMetadata = appState.bestLocation || appState.currentLocation;
    
    const metadata = {
        workFront,
        coronation,
        activityPerformed,
        observationCategory,
        location: bestLocationForMetadata,
        timestamp: new Date().toLocaleString()
    };

    // Persistence
    localStorage.setItem('gdrCamFormData', JSON.stringify({workFront, coronation, observationCategory, activityPerformed}));
    
    elements.saveMetadataBtn.innerHTML = '<span class="loading"></span> Procesando...';
    elements.saveMetadataBtn.disabled = true;
    
    addMetadataToImage(appState.capturedPhotoDataUrl, metadata);
}

function handleSaveWithoutForm() {
    const bestLocationForMetadata = appState.bestLocation || appState.currentLocation;
    const metadata = {
        location: bestLocationForMetadata,
        timestamp: new Date().toLocaleString()
    };
    
    elements.saveWithoutFormBtn.innerHTML = '<span class="loading"></span>...';
    elements.saveWithoutFormBtn.disabled = true;
    
    addMetadataToImage(appState.capturedPhotoDataUrl, metadata);
}

// Metadata Integration (EXIF)
async function addMetadataToImage(imageDataUrl, metadata) {
    try {
        let exifObj;
        
        if (typeof piexif !== 'undefined') {
            // Initialize clean EXIF
            exifObj = {"0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "thumbnail": null};
            
            // Add User Comment (JSON data)
            if (metadata.workFront) {
                const jsonStr = JSON.stringify(metadata);
                const userComment = "ASCII\0" + jsonStr;
                exifObj["Exif"][piexif.ExifIFD.UserComment] = userComment;
            }

            // Add GPS
            if (metadata.location) {
                const lat = metadata.location.latitude;
                const lng = metadata.location.longitude;
                const latRef = lat >= 0 ? "N" : "S";
                const lngRef = lng >= 0 ? "E" : "W";
                const absLat = Math.abs(lat);
                const absLng = Math.abs(lng);
                
                const latDeg = Math.floor(absLat);
                const latMin = Math.floor((absLat - latDeg) * 60);
                const latSec = ((absLat - latDeg) * 60 - latMin) * 60;
                
                const lngDeg = Math.floor(absLng);
                const lngMin = Math.floor((absLng - lngDeg) * 60);
                const lngSec = ((absLng - lngDeg) * 60 - lngMin) * 60;

                exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] = latRef;
                exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = [[latDeg, 1], [latMin, 1], [Math.round(latSec * 10000), 10000]];
                exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lngRef;
                exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = [[lngDeg, 1], [lngMin, 1], [Math.round(lngSec * 10000), 10000]];
                
                // Date stamp
                 const now = new Date();
                 const gpsDate = now.getFullYear() + ":" + String(now.getMonth()+1).padStart(2,'0') + ":" + String(now.getDate()).padStart(2,'0');
                 exifObj["GPS"][piexif.GPSIFD.GPSDateStamp] = gpsDate;
            }

            // Add DateTimeOriginal
            const now = new Date();
            const dateTimeOriginal = now.getFullYear() + ":" + 
                String(now.getMonth() + 1).padStart(2, '0') + ":" + 
                String(now.getDate()).padStart(2, '0') + " " +
                String(now.getHours()).padStart(2, '0') + ":" + 
                String(now.getMinutes()).padStart(2, '0') + ":" + 
                String(now.getSeconds()).padStart(2, '0');
            exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = dateTimeOriginal;
            exifObj["0th"][piexif.ImageIFD.DateTime] = dateTimeOriginal;

            // Create image with EXIF
            const exifBytes = piexif.dump(exifObj);
            const imageWithExif = piexif.insert(exifBytes, imageDataUrl);
            
            appState.photoWithMetadata = imageWithExif;
            appState.originalPhotoWithMetadata = imageWithExif;
            elements.photoPreview.src = imageWithExif;
            
            // Auto rotate -90 per request
            await rotateImage(-90);
            
            // Show result
            elements.formSection.classList.add('hidden');
            elements.resultSection.classList.remove('hidden');
            showStatus('Metadatos guardados.', 'success');

        } else {
             throw new Error("Librería piexif no cargada");
        }
    } catch (err) {
        console.error(err);
        showStatus('Error al guardar metadatos: ' + err.message, 'error');
    } finally {
         if (elements.saveMetadataBtn) {
            elements.saveMetadataBtn.innerHTML = 'Guardar Foto con Metadatos';
            elements.saveMetadataBtn.disabled = false;
        }
        if (elements.saveWithoutFormBtn) {
            elements.saveWithoutFormBtn.innerHTML = 'Guardar Foto sin Formulario';
            elements.saveWithoutFormBtn.disabled = false;
        }
    }
}

// Rotation Logic
async function rotateImage(angle) {
    if (!appState.photoWithMetadata) return;

    const img = new Image();
    img.onload = function() {
        const exifObj = piexif.load(appState.photoWithMetadata);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
            canvas.width = img.height;
            canvas.height = img.width;
        } else {
            canvas.width = img.width;
            canvas.height = img.height;
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
        
        appState.imageRotation = (appState.imageRotation + angle) % 360;
    };
    img.src = appState.photoWithMetadata;
}

// Download Handler
async function handleDownload() {
    if (!appState.photoWithMetadata) return;
    elements.downloadPhotoBtn.innerHTML = '<span class="loading"></span> Guardando...';
    elements.downloadPhotoBtn.disabled = true;

    // Add visible timestamp/logo before saving
    const imageToSave = await addTimestampAndLogoToImage(appState.photoWithMetadata);

    const link = document.createElement('a');
    link.download = `GDR-CAM-${new Date().getTime()}.jpg`;
    link.href = imageToSave;
    link.click();
    
    showStatus('Guardado.', 'success');
    elements.downloadPhotoBtn.innerHTML = 'Guardar en Galería';
    elements.downloadPhotoBtn.disabled = false;
}

// Helper: Add visible overlay
function addTimestampAndLogoToImage(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0);
            
            // Load existing EXIF to preserve it
            const exifObj = piexif.load(imageUrl);
            
            // Overlay Logic
            const fontSize = Math.max(20, Math.floor(canvas.height * 0.03));
            const padding = fontSize / 2;
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textBaseline = 'bottom';
            
            const timestamp = new Date().toLocaleString();
            let gpsText = "Sin GPS";
            
            // Try to get coords from EXIF for display
            // (Simplified logic for brevity, assuming we put them there)
             if (exifObj.GPS && exifObj.GPS[piexif.GPSIFD.GPSLatitude]) {
                 // Just display what we have in state as it's easier than parsing back from EXIF bytes for the overlay
                 const loc = appState.bestLocation || appState.currentLocation;
                 if (loc) {
                     gpsText = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)} (±${Math.round(loc.accuracy)}m)`;
                 }
             }

            // Draw North Arrow (Bottom Center)
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.strokeText('⬆ N', canvas.width / 2, canvas.height - padding - fontSize);
            ctx.fillText('⬆ N', canvas.width / 2, canvas.height - padding - fontSize);
            ctx.strokeText(gpsText, canvas.width / 2, canvas.height - padding);
            ctx.fillText(gpsText, canvas.width / 2, canvas.height - padding);
            
            // Draw Timestamp (Bottom Right)
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

// New Capture
function newCapture() {
    elements.resultSection.classList.add('hidden');
    elements.cameraSection.classList.remove('hidden');
    elements.takePhotoBtn.disabled = false;
    
    // Reset state
    appState.capturedPhotoDataUrl = null;
    appState.photoWithMetadata = null;
    elements.photoPreview.src = '';
    elements.cameraInput.value = ''; // Clear input
    
    loadPersistentData();
}

// Searchable Select Helper
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

// Helper: Orientation Correction
function correctImageOrientation(imageDataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            EXIF.getData(img, function() {
                const orientation = EXIF.getTag(this, "Orientation");
                if (!orientation || orientation === 1) {
                    resolve(imageDataUrl);
                    return;
                }
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let { width, height } = img;
                
                if (orientation > 4) { [width, height] = [height, width]; }
                
                canvas.width = width;
                canvas.height = height;
                
                switch (orientation) {
                    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
                    case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
                    case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
                    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
                    case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
                    case 7: ctx.transform(0, -1, -1, 0, height, width); break;
                    case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
                }
                
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.92));
            });
        };
        img.src = imageDataUrl;
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
        display.textContent = JSON.stringify(exif, null, 2); // Simplified for brevity
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

// Init
window.addEventListener('DOMContentLoaded', init);
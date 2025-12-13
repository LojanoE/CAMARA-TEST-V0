// imageProcessorWorker.js

// Shim for libraries that expect 'window' or 'document' (like piexif might)
self.window = self;
self.document = {
    createElement: function() { return {}; } // Mock minimal document object
};

// Import necessary scripts into the worker's scope
try {
    importScripts('./piexif.js');
} catch (e) {
    console.error("Failed to import piexif.js:", e);
}

// Check if piexif loaded correctly
if (typeof piexif === 'undefined') {
    console.error("piexif library not loaded in worker!");
    // Attempt to look for it on self/window if it attached there
    if (self.piexif) {
        var piexif = self.piexif;
    } else if (self.window && self.window.piexif) {
        var piexif = self.window.piexif;
    }
}

// Helper to convert DataURL to Blob for FileSaver
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

// --- ENHANCED OVERLAY LOGIC FROM ADAPTED CODE ---
async function addTimestampAndLogoToImage(imageUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            // Optimization: Use direct conversion instead of fetch for Data URLs
            // This is more robust in Workers.
            const blob = dataURLtoBlob(imageUrl);
            
            // Use createImageBitmap which is available in Workers
            const imgBitmap = await createImageBitmap(blob);

            const canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
            const ctx = canvas.getContext('2d');
            
            // Set canvas dimensions
            canvas.width = imgBitmap.width;
            canvas.height = imgBitmap.height;
            
            // Draw the image on the canvas
            ctx.drawImage(imgBitmap, 0, 0);
            
            // Important: Close the bitmap to release memory
            imgBitmap.close(); 
            
            // Load existing EXIF to preserve it
            const exifObj = piexif.load(imageUrl);
            
            const drawOverlays = () => {
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                const padding = Math.min(25, canvasWidth * 0.02, canvasHeight * 0.02); 

                // Draw north direction indicator (Bottom Center)
                const fontSize = Math.min(80, Math.max(20, Math.floor(canvasHeight * 0.04))); 
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                const centerX = canvasWidth / 2;
                const northY = canvasHeight - fontSize * 0.8;

                // Extract GPS data from EXIF if available
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
                
                // Draw North Arrow
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = Math.max(1, fontSize / 20); 
                ctx.strokeText('⬆', centerX, northY - padding);
                ctx.fillText('⬆', centerX, northY - padding); // Corrected: was + padding in app.js old version, but logic here seems consistent
                
                // Draw GPS info
                ctx.strokeText(gpsInfo, centerX, northY + padding);
                ctx.fillText(gpsInfo, centerX, northY + padding);
                
                // Draw Timestamp (Bottom Right)
                const timestamp = exifObj['Exif'] && exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] 
                    ? exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] 
                    : new Date().toLocaleString();

                ctx.textAlign = 'right';
                const timestampX = canvasWidth - padding;
                const timestampY = canvasHeight - padding;
                
                ctx.strokeText(timestamp, timestampX, timestampY);
                ctx.fillText(timestamp, timestampX, timestampY);

                // Convert OffscreenCanvas to Blob
                canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
                      .then(blob => {
                            // Re-insert EXIF data
                            const reader = new FileReader();
                            reader.onload = () => {
                                try {
                                    const processedDataUrl = piexif.insert(piexif.dump(exifObj), reader.result);
                                    resolve(processedDataUrl);
                                } catch (exifError) {
                                    console.error("EXIF re-insertion failed in worker:", exifError);
                                    reject(exifError);
                                }
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                      })
                      .catch(reject);
            };
            
            drawOverlays();

        } catch (err) {
            reject(new Error('Error processing image in worker: ' + err.message));
        }
    });
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
    const { id, imageDataUrl } = event.data;
    try {
        const processedDataUrl = await addTimestampAndLogoToImage(imageDataUrl);
        const processedBlob = dataURLtoBlob(processedDataUrl);
        // Transfer the Blob back to the main thread
        // Note: Blobs are cloneable, not transferable in the strict sense like ArrayBuffers, 
        // but passing them is efficient.
        self.postMessage({ id, processedBlob }); 
    } catch (error) {
        console.error('Error processing image in worker:', error);
        self.postMessage({ id, error: error.message });
    }
};
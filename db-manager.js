/**
 * DB Manager - IndexedDB extendido para frentes, actividades y cola de sync
 * Maneja el cache local y la cola de sincronización
 */

const DB_MANAGER = {
    DB_NAME: 'GDR_CAM_DB',
    DB_VERSION: 3, // Incrementado para tabla coronamientos
    
    // Nombres de object stores
    STORES: {
        PHOTOS: 'photos',
        FRENTES_CACHE: 'frentes_cache',
        ACTIVIDADES_CACHE: 'actividades_cache',
        CORONAMIENTOS_CACHE: 'coronamientos_cache',
        SYNC_QUEUE: 'sync_queue'
    },
    
    db: null,
    
    /**
     * Inicializa la base de datos
     */
    async init() {
        console.log('DB_MANAGER.init() called');
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };
            request.onsuccess = () => {
                console.log('IndexedDB opened successfully');
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('IndexedDB upgrade needed, creating stores...');
                const db = event.target.result;
                
                // Store de fotos (existente)
                if (!db.objectStoreNames.contains(this.STORES.PHOTOS)) {
                    const photoStore = db.createObjectStore(this.STORES.PHOTOS, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    photoStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Store de cache de frentes
                if (!db.objectStoreNames.contains(this.STORES.FRENTES_CACHE)) {
                    db.createObjectStore(this.STORES.FRENTES_CACHE, { keyPath: 'id' });
                }
                
                // Store de cache de actividades
                if (!db.objectStoreNames.contains(this.STORES.ACTIVIDADES_CACHE)) {
                    db.createObjectStore(this.STORES.ACTIVIDADES_CACHE, { keyPath: 'id' });
                }
                
                // Store de cache de coronamientos
                if (!db.objectStoreNames.contains(this.STORES.CORONAMIENTOS_CACHE)) {
                    db.createObjectStore(this.STORES.CORONAMIENTOS_CACHE, { keyPath: 'id' });
                }
                
                // Store de cola de sincronización
                if (!db.objectStoreNames.contains(this.STORES.SYNC_QUEUE)) {
                    const syncStore = db.createObjectStore(this.STORES.SYNC_QUEUE, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncStore.createIndex('synced', 'synced', { unique: false });
                }
                console.log('IndexedDB stores created successfully');
            };
        });
    },
    
    /**
     * Guarda frentes en cache local
     * @param {Array} frentes - Array de objetos frente desde Supabase
     */
    async cacheFrentes(frentes) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.FRENTES_CACHE], 'readwrite');
            const store = transaction.objectStore(this.STORES.FRENTES_CACHE);
            
            // Limpiar cache anterior
            store.clear();
            
            // Guardar nuevos frentes
            let completed = 0;
            frentes.forEach(frente => {
                const request = store.put({
                    id: frente.id,
                    nombre: frente.nombre,
                    activo: frente.activo,
                    updated_at: frente.updated_at,
                    cached_at: new Date().toISOString()
                });
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === frentes.length) resolve();
                };
                
                request.onerror = () => reject(request.error);
            });
            
            if (frentes.length === 0) resolve();
        });
    },
    
    /**
     * Obtiene frentes del cache local
     * @returns {Promise<Array>}
     */
    async getCachedFrentes() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.FRENTES_CACHE], 'readonly');
            const store = transaction.objectStore(this.STORES.FRENTES_CACHE);
            const request = store.getAll();
            
            request.onsuccess = () => {
                // Filtrar solo activos y ordenar por nombre
                const activos = request.result
                    .filter(f => f.activo !== false)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre));
                resolve(activos);
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Guarda actividades en cache local
     * @param {Array} actividades - Array de objetos actividad desde Supabase
     */
    async cacheActividades(actividades) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.ACTIVIDADES_CACHE], 'readwrite');
            const store = transaction.objectStore(this.STORES.ACTIVIDADES_CACHE);
            
            store.clear();
            
            let completed = 0;
            actividades.forEach(actividad => {
                const request = store.put({
                    id: actividad.id,
                    nombre: actividad.nombre,
                    activo: actividad.activo,
                    updated_at: actividad.updated_at,
                    cached_at: new Date().toISOString()
                });
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === actividades.length) resolve();
                };
                
                request.onerror = () => reject(request.error);
            });
            
            if (actividades.length === 0) resolve();
        });
    },
    
    /**
     * Obtiene actividades del cache local
     * @returns {Promise<Array>}
     */
    async getCachedActividades() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.ACTIVIDADES_CACHE], 'readonly');
            const store = transaction.objectStore(this.STORES.ACTIVIDADES_CACHE);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const activas = request.result
                    .filter(a => a.activo !== false)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre));
                resolve(activas);
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Guarda coronamientos en cache local
     * @param {Array} coronamientos - Array de objetos coronamiento desde Supabase
     */
    async cacheCoronamientos(coronamientos) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.CORONAMIENTOS_CACHE], 'readwrite');
            const store = transaction.objectStore(this.STORES.CORONAMIENTOS_CACHE);
            
            store.clear();
            
            let completed = 0;
            coronamientos.forEach(coronamiento => {
                const request = store.put({
                    id: coronamiento.id,
                    nombre: coronamiento.nombre,
                    activo: coronamiento.activo,
                    updated_at: coronamiento.updated_at,
                    cached_at: new Date().toISOString()
                });
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === coronamientos.length) resolve();
                };
                
                request.onerror = () => reject(request.error);
            });
            
            if (coronamientos.length === 0) resolve();
        });
    },
    
    /**
     * Obtiene coronamientos del cache local
     * @returns {Promise<Array>}
     */
    async getCachedCoronamientos() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.CORONAMIENTOS_CACHE], 'readonly');
            const store = transaction.objectStore(this.STORES.CORONAMIENTOS_CACHE);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const activos = request.result
                    .filter(c => c.activo !== false)
                    .sort((a, b) => a.nombre.localeCompare(b.nombre));
                resolve(activos);
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Agrega un cambio a la cola de sincronización
     * @param {string} tabla - 'frentes' o 'actividades'
     * @param {string} operacion - 'insert', 'update', 'delete'
     * @param {Object} datos - Datos de la operación
     */
    async addToSyncQueue(tabla, operacion, datos) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.SYNC_QUEUE], 'readwrite');
            const store = transaction.objectStore(this.STORES.SYNC_QUEUE);
            
            const item = {
                tabla,
                operacion,
                datos,
                timestamp: new Date().getTime(),
                synced: false,
                attempts: 0
            };
            
            const request = store.add(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Obtiene items pendientes de sincronización
     * @returns {Promise<Array>}
     */
    async getPendingSyncItems() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.SYNC_QUEUE], 'readonly');
            const store = transaction.objectStore(this.STORES.SYNC_QUEUE);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const items = request.result
                    .filter(item => item.synced === false)
                    .sort((a, b) => a.timestamp - b.timestamp);
                resolve(items);
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Marca un item como sincronizado
     * @param {number} id - ID del item en la cola
     */
    async markAsSynced(id) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.SYNC_QUEUE], 'readwrite');
            const store = transaction.objectStore(this.STORES.SYNC_QUEUE);
            
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    item.synced = true;
                    item.synced_at = new Date().toISOString();
                    const updateRequest = store.put(item);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve();
                }
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    },
    
    /**
     * Incrementa el contador de intentos de un item
     * @param {number} id - ID del item
     */
    async incrementAttempt(id) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.SYNC_QUEUE], 'readwrite');
            const store = transaction.objectStore(this.STORES.SYNC_QUEUE);
            
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    item.attempts = (item.attempts || 0) + 1;
                    const updateRequest = store.put(item);
                    updateRequest.onsuccess = () => resolve(item.attempts);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(0);
                }
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    },
    
    /**
     * Elimina items ya sincronizados (limpieza)
     */
    async cleanSyncedItems() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.SYNC_QUEUE], 'readwrite');
            const store = transaction.objectStore(this.STORES.SYNC_QUEUE);
            const request = store.getAll();
            
            let deleted = 0;
            
            request.onsuccess = (event) => {
                const items = request.result.filter(item => item.synced === true);
                let completed = 0;
                
                if (items.length === 0) {
                    resolve(0);
                    return;
                }
                
                items.forEach(item => {
                    const deleteRequest = store.delete(item.id);
                    deleteRequest.onsuccess = () => {
                        deleted++;
                        completed++;
                        if (completed === items.length) resolve(deleted);
                    };
                    deleteRequest.onerror = () => {
                        completed++;
                        if (completed === items.length) resolve(deleted);
                    };
                });
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    /**
     * Obtiene estadísticas de sincronización
     */
    async getSyncStats() {
        if (!this.db) await this.init();
        
        const pending = await this.getPendingSyncItems();
        
        return {
            pending: pending.length,
            hasCritical: pending.some(p => p.attempts > 3)
        };
    },
    
    /**
     * Fuerza la limpieza completa del cache (útil para debug)
     */
    async clearAllCache() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(
                [this.STORES.FRENTES_CACHE, this.STORES.ACTIVIDADES_CACHE, this.STORES.CORONAMIENTOS_CACHE], 
                'readwrite'
            );
            
            transaction.objectStore(this.STORES.FRENTES_CACHE).clear();
            transaction.objectStore(this.STORES.ACTIVIDADES_CACHE).clear();
            transaction.objectStore(this.STORES.CORONAMIENTOS_CACHE).clear();
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
};

// Exponer globalmente
window.DB_MANAGER = DB_MANAGER;

/**
 * Supabase Client - Cliente de Supabase con lógica de sincronización
 * Gestiona la comunicación con Supabase y el sync offline-first
 */

const SUPABASE_CONFIG = {
    URL: 'https://dzmhhlsttqygjvfabdxx.supabase.co',
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bWhobHN0dHF5Z2p2ZmFiZHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTE3MDAsImV4cCI6MjA5MDcyNzcwMH0._Gf0G2gpV_9QAYqFx1Kn6TN0lFDq3LxmBdNI82Suj-o'
};

const SUPABASE_CLIENT = {
    client: null,
    initialized: false,
    
    /**
     * Inicializa el cliente de Supabase
     * Nota: Requiere que supabase.min.js esté cargado
     */
    init() {
        if (this.initialized) return this.client;
        
        if (typeof supabase === 'undefined') {
            console.error('Supabase library not loaded');
            return null;
        }
        
        this.client = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);
        this.initialized = true;
        console.log('Supabase client initialized');
        return this.client;
    },
    
    /**
     * Obtiene frentes desde Supabase
     * @returns {Promise<Array>}
     */
    async fetchFrentes() {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('frentes')
                .select('*')
                .eq('activo', true)
                .order('nombre');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching frentes:', error);
            throw error;
        }
    },
    
    /**
     * Obtiene actividades desde Supabase
     * @returns {Promise<Array>}
     */
    async fetchActividades() {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('actividades')
                .select('*')
                .eq('activo', true)
                .order('nombre');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching actividades:', error);
            throw error;
        }
    },
    
    /**
     * Obtiene coronamientos desde Supabase
     * @returns {Promise<Array>}
     */
    async fetchCoronamientos() {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('coronamientos')
                .select('*')
                .eq('activo', true)
                .order('nombre');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching coronamientos:', error);
            throw error;
        }
    },
    
    /**
     * Crea un nuevo frente en Supabase
     * @param {string} nombre - Nombre del frente
     */
    async createFrente(nombre) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('frentes')
                .insert([{ nombre, activo: true }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating frente:', error);
            throw error;
        }
    },
    
    /**
     * Crea una nueva actividad en Supabase
     * @param {string} nombre - Nombre de la actividad
     */
    async createActividad(nombre) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('actividades')
                .insert([{ nombre, activo: true }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating actividad:', error);
            throw error;
        }
    },
    
    /**
     * Crea un nuevo coronamiento en Supabase
     * @param {string} nombre - Nombre del coronamiento
     */
    async createCoronamiento(nombre) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('coronamientos')
                .insert([{ nombre, activo: true }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating coronamiento:', error);
            throw error;
        }
    },
    
    /**
     * Actualiza un frente en Supabase
     * @param {string} id - UUID del frente
     * @param {Object} updates - Campos a actualizar
     */
    async updateFrente(id, updates) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('frentes')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating frente:', error);
            throw error;
        }
    },
    
    /**
     * Actualiza una actividad en Supabase
     * @param {string} id - UUID de la actividad
     * @param {Object} updates - Campos a actualizar
     */
    async updateActividad(id, updates) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('actividades')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating actividad:', error);
            throw error;
        }
    },
    
    /**
     * Actualiza un coronamiento en Supabase
     * @param {string} id - UUID del coronamiento
     * @param {Object} updates - Campos a actualizar
     */
    async updateCoronamiento(id, updates) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('coronamientos')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating coronamiento:', error);
            throw error;
        }
    },
    
    /**
     * Elimina (desactiva) un frente en Supabase
     * Nota: Usamos soft-delete (cambiamos activo a false)
     * @param {string} id - UUID del frente
     */
    async deleteFrente(id) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('frentes')
                .update({ activo: false })
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error deleting frente:', error);
            throw error;
        }
    },
    
    /**
     * Elimina (desactiva) una actividad en Supabase
     * @param {string} id - UUID de la actividad
     */
    async deleteActividad(id) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('actividades')
                .update({ activo: false })
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error deleting actividad:', error);
            throw error;
        }
    },
    
    /**
     * Elimina (desactiva) un coronamiento en Supabase
     * @param {string} id - UUID del coronamiento
     */
    async deleteCoronamiento(id) {
        this.init();
        if (!this.client) throw new Error('Supabase client not initialized');
        
        try {
            const { data, error } = await this.client
                .from('coronamientos')
                .update({ activo: false })
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error deleting coronamiento:', error);
            throw error;
        }
    },
    
    /**
     * Sincroniza los cambios pendientes con Supabase
     * Procesa la cola de sincronización
     * @returns {Promise<Object>} - Resultado de la sincronización
     */
    async syncPendingChanges() {
        // Verificar conexión primero
        const canSync = await CONNECTION_MONITOR.canSync();
        if (!canSync) {
            return {
                success: false,
                message: 'Conexión insuficiente para sincronizar',
                synced: 0,
                failed: 0
            };
        }
        
        const pending = await DB_MANAGER.getPendingSyncItems();
        
        if (pending.length === 0) {
            return {
                success: true,
                message: 'No hay cambios pendientes',
                synced: 0,
                failed: 0
            };
        }
        
        let synced = 0;
        let failed = 0;
        const errors = [];
        
        for (const item of pending) {
            try {
                // Ejecutar la operación correspondiente
                switch (item.operacion) {
                    case 'insert_frente':
                        await this.createFrente(item.datos.nombre);
                        break;
                    case 'insert_actividad':
                        await this.createActividad(item.datos.nombre);
                        break;
                    case 'insert_coronamiento':
                        await this.createCoronamiento(item.datos.nombre);
                        break;
                    case 'update_frente':
                        await this.updateFrente(item.datos.id, item.datos.updates);
                        break;
                    case 'update_actividad':
                        await this.updateActividad(item.datos.id, item.datos.updates);
                        break;
                    case 'update_coronamiento':
                        await this.updateCoronamiento(item.datos.id, item.datos.updates);
                        break;
                    case 'delete_frente':
                        await this.deleteFrente(item.datos.id);
                        break;
                    case 'delete_actividad':
                        await this.deleteActividad(item.datos.id);
                        break;
                    case 'delete_coronamiento':
                        await this.deleteCoronamiento(item.datos.id);
                        break;
                    default:
                        console.warn('Unknown operation:', item.operacion);
                }
                
                // Marcar como sincronizado
                await DB_MANAGER.markAsSynced(item.id);
                synced++;
                
            } catch (error) {
                console.error(`Error syncing item ${item.id}:`, error);
                await DB_MANAGER.incrementAttempt(item.id);
                failed++;
                errors.push({ item: item.id, error: error.message });
            }
        }
        
        // Limpiar items ya sincronizados
        await DB_MANAGER.cleanSyncedItems();
        
        return {
            success: failed === 0,
            message: failed === 0 
                ? `${synced} cambios sincronizados` 
                : `${synced} sincronizados, ${failed} fallidos`,
            synced,
            failed,
            errors: errors.length > 0 ? errors : undefined
        };
    },
    
    /**
     * Carga frentes y actividades con estrategia offline-first
     * 1. Muestra cache inmediatamente
     * 2. Si hay buena conexión, actualiza desde Supabase
     * @param {Function} onUpdate - Callback cuando hay nuevos datos
     */
    async loadDataWithCache(onUpdate) {
        // Primero: cargar desde cache (respuesta inmediata)
        const cachedFrentes = await DB_MANAGER.getCachedFrentes();
        const cachedActividades = await DB_MANAGER.getCachedActividades();
        const cachedCoronamientos = await DB_MANAGER.getCachedCoronamientos();
        
        if (cachedFrentes.length > 0 || cachedActividades.length > 0 || cachedCoronamientos.length > 0) {
            onUpdate({
                frentes: cachedFrentes.map(f => f.nombre),
                actividades: cachedActividades.map(a => a.nombre),
                coronamientos: cachedCoronamientos.map(c => c.nombre),
                source: 'cache',
                timestamp: new Date().toISOString()
            });
        }
        
        // Luego: verificar conexión y actualizar si es buena
        const connectionStatus = await CONNECTION_MONITOR.checkConnectionQuality();
        
        if (!connectionStatus.canSync) {
            console.log('Using cached data - connection insufficient:', connectionStatus.message);
            return {
                success: true,
                fromCache: true,
                connectionStatus
            };
        }
        
        try {
            // Intentar obtener datos frescos
            const [frentes, actividades, coronamientos] = await Promise.all([
                this.fetchFrentes(),
                this.fetchActividades(),
                this.fetchCoronamientos()
            ]);
            
            // Guardar en cache
            await DB_MANAGER.cacheFrentes(frentes);
            await DB_MANAGER.cacheActividades(actividades);
            await DB_MANAGER.cacheCoronamientos(coronamientos);
            
            // Notificar actualización
            onUpdate({
                frentes: frentes.map(f => f.nombre),
                actividades: actividades.map(a => a.nombre),
                coronamientos: coronamientos.map(c => c.nombre),
                source: 'supabase',
                timestamp: new Date().toISOString()
            });
            
            // Procesar cambios pendientes del admin
            await this.syncPendingChanges();
            
            return {
                success: true,
                fromCache: false,
                connectionStatus
            };
            
        } catch (error) {
            console.error('Error fetching from Supabase:', error);
            return {
                success: false,
                fromCache: true,
                error: error.message,
                connectionStatus
            };
        }
    }
};

// Exponer globalmente
window.SUPABASE_CLIENT = SUPABASE_CLIENT;

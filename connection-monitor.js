/**
 * Connection Monitor - Detección de calidad de conexión
 * Estrategia C: effectiveType + ping de latencia
 */

const CONNECTION_MONITOR = {
    // Umbrales de calidad
    PING_TIMEOUT: 5000,        // Máximo tiempo de espera para ping (ms)
    GOOD_PING_THRESHOLD: 2000, // Ping < 2seg para 3g es bueno
    EXCELLENT_PING: 1000,      // Ping < 1seg es excelente
    
    // Estados de conexión
    UNKNOWN: 'unknown',
    OFFLINE: 'offline',
    POOR: 'poor',      // Mala - no sincronizar
    FAIR: 'fair',      // Regular - considerar
    GOOD: 'good',      // Buena - sincronizar
    EXCELLENT: 'excellent', // Excelente - sincronizar
    
    // Configuración de Supabase para pings
    SUPABASE_URL: 'https://dzmhhlsttqygjvfabdxx.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bWhobHN0dHF5Z2p2ZmFiZHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTE3MDAsImV4cCI6MjA5MDcyNzcwMH0._Gf0G2gpV_9QAYqFx1Kn6TN0lFDq3LxmBdNI82Suj-o',
    
    /**
     * Obtiene el estado actual de la conexión del navegador
     */
    getBrowserConnectionStatus() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        if (!navigator.onLine) {
            return { type: this.OFFLINE, effectiveType: 'offline', downlink: 0 };
        }
        
        if (conn) {
            return {
                type: conn.effectiveType || this.UNKNOWN,
                effectiveType: conn.effectiveType,
                downlink: conn.downlink || 0,
                rtt: conn.rtt || 0,
                saveData: conn.saveData || false
            };
        }
        
        return { type: this.UNKNOWN, effectiveType: 'unknown', downlink: 0 };
    },
    
    /**
     * Realiza un ping a Supabase para medir latencia real
     * @returns {Promise<number>} - Tiempo de respuesta en ms, o Infinity si falla
     */
    async pingSupabase() {
        const startTime = performance.now();
        
        try {
            // Hacemos un fetch ligero a la tabla frentes con limit 1
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.PING_TIMEOUT);
            
            const response = await fetch(
                `${this.SUPABASE_URL}/rest/v1/frentes?select=id&limit=1`,
                {
                    method: 'GET',
                    headers: {
                        'apikey': this.SUPABASE_KEY,
                        'Authorization': `Bearer ${this.SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                }
            );
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return performance.now() - startTime;
            }
            
            return Infinity;
        } catch (error) {
            return Infinity;
        }
    },
    
    /**
     * Determina si la conexión es suficientemente buena para sincronizar
     * @returns {Promise<Object>} - Estado completo de la conexión
     */
    async checkConnectionQuality() {
        const browserStatus = this.getBrowserConnectionStatus();
        
        // Si está offline, no hay nada que hacer
        if (browserStatus.type === this.OFFLINE) {
            return {
                status: this.OFFLINE,
                canSync: false,
                message: 'Sin conexión a internet',
                ping: Infinity,
                details: browserStatus
            };
        }
        
        // Para conexiones lentas conocidas, rechazar inmediatamente
        if (['slow-2g', '2g'].includes(browserStatus.effectiveType)) {
            return {
                status: this.POOR,
                canSync: false,
                message: 'Conexión muy lenta (2G)',
                ping: Infinity,
                details: browserStatus
            };
        }
        
        // Para 4g o mejor, hacer ping para confirmar
        const pingTime = await this.pingSupabase();
        
        if (pingTime === Infinity) {
            return {
                status: this.OFFLINE,
                canSync: false,
                message: 'No se puede conectar al servidor',
                ping: Infinity,
                details: browserStatus
            };
        }
        
        // Evaluar calidad basada en ping y tipo de conexión
        if (browserStatus.effectiveType === '4g' && pingTime < this.EXCELLENT_PING) {
            return {
                status: this.EXCELLENT,
                canSync: true,
                message: 'Conexión excelente',
                ping: Math.round(pingTime),
                details: browserStatus
            };
        }
        
        if (pingTime < this.GOOD_PING_THRESHOLD) {
            return {
                status: this.GOOD,
                canSync: true,
                message: 'Conexión buena',
                ping: Math.round(pingTime),
                details: browserStatus
            };
        }
        
        if (pingTime < this.PING_TIMEOUT) {
            return {
                status: this.FAIR,
                canSync: false, // No sincronizamos en conexión regular
                message: 'Conexión regular - esperando mejor señal',
                ping: Math.round(pingTime),
                details: browserStatus
            };
        }
        
        return {
            status: this.POOR,
            canSync: false,
            message: 'Conexión lenta',
            ping: Math.round(pingTime),
            details: browserStatus
        };
    },
    
    /**
     * Verifica rápidamente si se puede sincronizar (sin detalles)
     * @returns {Promise<boolean>}
     */
    async canSync() {
        const quality = await this.checkConnectionQuality();
        return quality.canSync;
    },
    
    /**
     * Obtiene icono y clase CSS según estado
     */
    getStatusVisuals(status) {
        const visuals = {
            [this.OFFLINE]: { icon: '⚠️', class: 'status-offline', color: '#dc3545' },
            [this.POOR]: { icon: '🐌', class: 'status-poor', color: '#fd7e14' },
            [this.FAIR]: { icon: '⏳', class: 'status-fair', color: '#ffc107' },
            [this.GOOD]: { icon: '✓', class: 'status-good', color: '#28a745' },
            [this.EXCELLENT]: { icon: '✓✓', class: 'status-excellent', color: '#20c997' },
            [this.UNKNOWN]: { icon: '?', class: 'status-unknown', color: '#6c757d' }
        };
        return visuals[status] || visuals[this.UNKNOWN];
    }
};

// Exponer globalmente
window.CONNECTION_MONITOR = CONNECTION_MONITOR;

/**
 * Admin Panel - Panel de administración para GDR
 * Permite gestionar frentes y actividades con soporte offline
 */

console.log('Loading admin-panel.js...');

const ADMIN_PANEL = {
    // Credenciales (simples, solo UI-level)
    CREDENTIALS: {
        username: 'GDR',
        password: 'Mirador1'
    },
    
    isAuthenticated: false,
    currentTab: 'frentes',
    
    /**
     * Verifica credenciales
     */
    login(username, password) {
        if (username === this.CREDENTIALS.username && password === this.CREDENTIALS.password) {
            this.isAuthenticated = true;
            localStorage.setItem('gdrAdminSession', JSON.stringify({
                authenticated: true,
                timestamp: new Date().getTime()
            }));
            return true;
        }
        return false;
    },
    
    /**
     * Verifica si hay sesión activa
     */
    checkSession() {
        const session = localStorage.getItem('gdrAdminSession');
        if (session) {
            const data = JSON.parse(session);
            // Sesión válida por 24 horas
            if (data.authenticated && (new Date().getTime() - data.timestamp) < 24 * 60 * 60 * 1000) {
                this.isAuthenticated = true;
                return true;
            }
        }
        this.isAuthenticated = false;
        return false;
    },
    
    /**
     * Cierra sesión
     */
    logout() {
        this.isAuthenticated = false;
        localStorage.removeItem('gdrAdminSession');
    },
    
    /**
     * Renderiza el panel de login
     */
    renderLogin(container) {
        console.log('Rendering login form');
        container.innerHTML = `
            <div class="admin-login">
                <h3>Acceso Administración</h3>
                <div class="form-group">
                    <label>Usuario:</label>
                    <input type="text" id="admin-user" placeholder="Usuario">
                </div>
                <div class="form-group">
                    <label>Contraseña:</label>
                    <input type="password" id="admin-pass" placeholder="Contraseña">
                </div>
                <button id="admin-login-btn" class="btn btn-primary">Ingresar</button>
                <button id="admin-cancel-btn" class="btn btn-secondary">Cancelar</button>
                <div id="admin-login-error" class="admin-error hidden"></div>
            </div>
        `;
        
        // Event listeners
        document.getElementById('admin-login-btn').addEventListener('click', () => {
            const user = document.getElementById('admin-user').value.trim();
            const pass = document.getElementById('admin-pass').value;
            const errorDiv = document.getElementById('admin-login-error');
            
            if (this.login(user, pass)) {
                this.renderPanel(container);
            } else {
                errorDiv.textContent = 'Usuario o contraseña incorrectos';
                errorDiv.classList.remove('hidden');
            }
        });
        
        document.getElementById('admin-cancel-btn').addEventListener('click', () => {
            this.hide();
        });
    },
    
    /**
     * Renderiza el panel principal de administración
     */
    async renderPanel(container) {
        // Obtener estadísticas
        const syncStats = await DB_MANAGER.getSyncStats();
        const connectionStatus = await CONNECTION_MONITOR.checkConnectionQuality();
        
        container.innerHTML = `
            <div class="admin-panel">
                <div class="admin-header">
                    <h3>Panel de Administración</h3>
                    <div class="admin-status">
                        <span class="connection-indicator ${connectionStatus.status}">
                            ${CONNECTION_MONITOR.getStatusVisuals(connectionStatus.status).icon}
                            ${connectionStatus.message}
                        </span>
                        ${syncStats.pending > 0 ? `
                            <span class="sync-pending-badge">
                                ${syncStats.pending} cambios pendientes
                            </span>
                        ` : ''}
                    </div>
                    <button id="admin-logout-btn" class="btn btn-small">Cerrar Sesión</button>
                </div>
                
                <div class="admin-tabs">
                    <button class="admin-tab ${this.currentTab === 'frentes' ? 'active' : ''}" data-tab="frentes">
                        Frentes de Trabajo
                    </button>
                    <button class="admin-tab ${this.currentTab === 'actividades' ? 'active' : ''}" data-tab="actividades">
                        Actividades
                    </button>
                    <button class="admin-tab ${this.currentTab === 'coronamientos' ? 'active' : ''}" data-tab="coronamientos">
                        Coronamientos
                    </button>
                </div>
                
                <div class="admin-content" id="admin-tab-content">
                    <!-- Contenido dinámico -->
                </div>
                
                <div class="admin-actions">
                    <button id="admin-sync-btn" class="btn btn-success" ${!connectionStatus.canSync ? 'disabled' : ''}>
                        <i class="fas fa-sync"></i> Sincronizar Ahora
                    </button>
                    <button id="admin-close-btn" class="btn btn-secondary">Cerrar</button>
                </div>
            </div>
        `;
        
        // Renderizar contenido según tab activo
        await this.renderTabContent();
        
        // Event listeners
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.currentTab = e.target.dataset.tab;
                this.renderPanel(container);
            });
        });
        
        document.getElementById('admin-logout-btn').addEventListener('click', () => {
            this.logout();
            this.hide();
        });
        
        document.getElementById('admin-close-btn').addEventListener('click', () => {
            this.hide();
        });
        
        document.getElementById('admin-sync-btn').addEventListener('click', async () => {
            await this.manualSync();
        });
    },
    
    /**
     * Renderiza el contenido del tab activo
     */
    async renderTabContent() {
        const content = document.getElementById('admin-tab-content');
        
        if (this.currentTab === 'frentes') {
            const frentes = await DB_MANAGER.getCachedFrentes();
            content.innerHTML = `
                <div class="admin-section">
                    <div class="admin-add-form">
                        <input type="text" id="new-frente-name" placeholder="Nombre del nuevo frente...">
                        <button id="add-frente-btn" class="btn btn-primary">
                            <i class="fas fa-plus"></i> Agregar
                        </button>
                    </div>
                    <div class="admin-list" id="admin-frentes-list">
                        ${this.renderList(frentes, 'frente')}
                    </div>
                </div>
            `;
            
            document.getElementById('add-frente-btn').addEventListener('click', () => {
                this.addItem('frente');
            });
            
        } else if (this.currentTab === 'actividades') {
            const actividades = await DB_MANAGER.getCachedActividades();
            content.innerHTML = `
                <div class="admin-section">
                    <div class="admin-add-form">
                        <input type="text" id="new-actividad-name" placeholder="Nombre de la nueva actividad...">
                        <button id="add-actividad-btn" class="btn btn-primary">
                            <i class="fas fa-plus"></i> Agregar
                        </button>
                    </div>
                    <div class="admin-list" id="admin-actividades-list">
                        ${this.renderList(actividades, 'actividad')}
                    </div>
                </div>
            `;
            
            document.getElementById('add-actividad-btn').addEventListener('click', () => {
                this.addItem('actividad');
            });
            
        } else if (this.currentTab === 'coronamientos') {
            const coronamientos = await DB_MANAGER.getCachedCoronamientos();
            content.innerHTML = `
                <div class="admin-section">
                    <div class="admin-add-form">
                        <input type="text" id="new-coronamiento-name" placeholder="Nombre del nuevo coronamiento...">
                        <button id="add-coronamiento-btn" class="btn btn-primary">
                            <i class="fas fa-plus"></i> Agregar
                        </button>
                    </div>
                    <div class="admin-list" id="admin-coronamientos-list">
                        ${this.renderList(coronamientos, 'coronamiento')}
                    </div>
                </div>
            `;
            
            document.getElementById('add-coronamiento-btn').addEventListener('click', () => {
                this.addItem('coronamiento');
            });
        }
        
        // Agregar listeners para editar/eliminar
        this.attachItemListeners();
    },
    
    /**
     * Renderiza una lista de items
     */
    renderList(items, type) {
        if (items.length === 0) {
            return '<p class="admin-empty">No hay items registrados</p>';
        }
        
        return items.map(item => `
            <div class="admin-item" data-id="${item.id}" data-type="${type}">
                <span class="admin-item-name">${this.escapeHtml(item.nombre)}</span>
                <div class="admin-item-actions">
                    <button class="admin-btn-edit" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="admin-btn-delete" title="Desactivar">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    /**
     * Escapa HTML para prevenir XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * Agrega listeners a los items de la lista
     */
    attachItemListeners() {
        // Editar
        document.querySelectorAll('.admin-btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.admin-item');
                const id = item.dataset.id;
                const type = item.dataset.type;
                const nameSpan = item.querySelector('.admin-item-name');
                const currentName = nameSpan.textContent;
                
                // Reemplazar con input editable
                nameSpan.innerHTML = `
                    <input type="text" class="admin-edit-input" value="${this.escapeHtml(currentName)}">
                    <button class="admin-btn-save"><i class="fas fa-check"></i></button>
                    <button class="admin-btn-cancel"><i class="fas fa-times"></i></button>
                `;
                
                const input = nameSpan.querySelector('.admin-edit-input');
                input.focus();
                input.select();
                
                nameSpan.querySelector('.admin-btn-save').addEventListener('click', () => {
                    this.updateItem(type, id, { nombre: input.value.trim() });
                });
                
                nameSpan.querySelector('.admin-btn-cancel').addEventListener('click', () => {
                    this.renderTabContent();
                });
                
                input.addEventListener('keypress', (ev) => {
                    if (ev.key === 'Enter') {
                        this.updateItem(type, id, { nombre: input.value.trim() });
                    }
                });
            });
        });
        
        // Eliminar (desactivar)
        document.querySelectorAll('.admin-btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.admin-item');
                const id = item.dataset.id;
                const type = item.dataset.type;
                const name = item.querySelector('.admin-item-name').textContent;
                
                if (confirm(`¿Desactivar "${name}"?\n\nEsto lo ocultará de la lista pero no lo eliminará permanentemente.`)) {
                    this.deleteItem(type, id);
                }
            });
        });
    },
    
    /**
     * Agrega un nuevo item
     */
    async addItem(type) {
        const input = document.getElementById(`new-${type}-name`);
        const name = input.value.trim();
        
        if (!name) {
            showStatus('Ingrese un nombre', 'warning');
            return;
        }
        
        try {
            // Verificar duplicados en cache
            let existing;
            if (type === 'frente') {
                existing = await DB_MANAGER.getCachedFrentes();
            } else if (type === 'actividad') {
                existing = await DB_MANAGER.getCachedActividades();
            } else if (type === 'coronamiento') {
                existing = await DB_MANAGER.getCachedCoronamientos();
            }
            
            if (existing.some(e => e.nombre.toLowerCase() === name.toLowerCase())) {
                showStatus('Este nombre ya existe', 'error');
                return;
            }
            
            // Mapear tipo a tabla y operación
            const tablaMap = { frente: 'frentes', actividad: 'actividades', coronamiento: 'coronamientos' };
            const operacionMap = { frente: 'insert_frente', actividad: 'insert_actividad', coronamiento: 'insert_coronamiento' };
            
            // Agregar a cola de sincronización
            await DB_MANAGER.addToSyncQueue(
                tablaMap[type],
                operacionMap[type],
                { nombre: name }
            );
            
            // Agregar localmente al cache (efecto inmediato)
            const tempItem = {
                id: `temp-${Date.now()}`,
                nombre: name,
                activo: true,
                updated_at: new Date().toISOString()
            };
            
            if (type === 'frente') {
                const current = await DB_MANAGER.getCachedFrentes();
                await DB_MANAGER.cacheFrentes([...current, tempItem]);
            } else if (type === 'actividad') {
                const current = await DB_MANAGER.getCachedActividades();
                await DB_MANAGER.cacheActividades([...current, tempItem]);
            } else if (type === 'coronamiento') {
                const current = await DB_MANAGER.getCachedCoronamientos();
                await DB_MANAGER.cacheCoronamientos([...current, tempItem]);
            }
            
            const typeLabels = { frente: 'Frente', actividad: 'Actividad', coronamiento: 'Coronamiento' };
            input.value = '';
            showStatus(`${typeLabels[type]} agregado. Pendiente de sincronización.`, 'success');
            
            // Re-renderizar
            await this.renderTabContent();
            
            // Intentar sincronizar si hay buena conexión
            const canSync = await CONNECTION_MONITOR.canSync();
            if (canSync) {
                await this.manualSync();
            }
            
        } catch (error) {
            console.error('Error adding item:', error);
            showStatus('Error al agregar. Intente nuevamente.', 'error');
        }
    },
    
    /**
     * Actualiza un item existente
     */
    async updateItem(type, id, updates) {
        try {
            // Mapear tipo a tabla y operación
            const tablaMap = { frente: 'frentes', actividad: 'actividades', coronamiento: 'coronamientos' };
            const operacionMap = { frente: 'update_frente', actividad: 'update_actividad', coronamiento: 'update_coronamiento' };
            
            // Agregar a cola de sincronización
            await DB_MANAGER.addToSyncQueue(
                tablaMap[type],
                operacionMap[type],
                { id, updates }
            );
            
            // Actualizar localmente
            if (type === 'frente') {
                const current = await DB_MANAGER.getCachedFrentes();
                const updated = current.map(f => 
                    f.id === id ? { ...f, ...updates, updated_at: new Date().toISOString() } : f
                );
                await DB_MANAGER.cacheFrentes(updated);
            } else if (type === 'actividad') {
                const current = await DB_MANAGER.getCachedActividades();
                const updated = current.map(a => 
                    a.id === id ? { ...a, ...updates, updated_at: new Date().toISOString() } : a
                );
                await DB_MANAGER.cacheActividades(updated);
            } else if (type === 'coronamiento') {
                const current = await DB_MANAGER.getCachedCoronamientos();
                const updated = current.map(c => 
                    c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c
                );
                await DB_MANAGER.cacheCoronamientos(updated);
            }
            
            showStatus('Cambio guardado. Pendiente de sincronización.', 'success');
            await this.renderTabContent();
            
            // Intentar sincronizar
            const canSync = await CONNECTION_MONITOR.canSync();
            if (canSync) {
                await this.manualSync();
            }
            
        } catch (error) {
            console.error('Error updating item:', error);
            showStatus('Error al actualizar. Intente nuevamente.', 'error');
        }
    },
    
    /**
     * Desactiva un item
     */
    async deleteItem(type, id) {
        try {
            // Mapear tipo a tabla y operación
            const tablaMap = { frente: 'frentes', actividad: 'actividades', coronamiento: 'coronamientos' };
            const operacionMap = { frente: 'delete_frente', actividad: 'delete_actividad', coronamiento: 'delete_coronamiento' };
            
            // Agregar a cola de sincronización
            await DB_MANAGER.addToSyncQueue(
                tablaMap[type],
                operacionMap[type],
                { id }
            );
            
            // Actualizar localmente (remover del cache)
            if (type === 'frente') {
                const current = await DB_MANAGER.getCachedFrentes();
                const updated = current.filter(f => f.id !== id);
                await DB_MANAGER.cacheFrentes(updated);
            } else if (type === 'actividad') {
                const current = await DB_MANAGER.getCachedActividades();
                const updated = current.filter(a => a.id !== id);
                await DB_MANAGER.cacheActividades(updated);
            } else if (type === 'coronamiento') {
                const current = await DB_MANAGER.getCachedCoronamientos();
                const updated = current.filter(c => c.id !== id);
                await DB_MANAGER.cacheCoronamientos(updated);
            }
            
            showStatus('Item desactivado. Pendiente de sincronización.', 'success');
            await this.renderTabContent();
            
            // Intentar sincronizar
            const canSync = await CONNECTION_MONITOR.canSync();
            if (canSync) {
                await this.manualSync();
            }
            
        } catch (error) {
            console.error('Error deleting item:', error);
            showStatus('Error al desactivar. Intente nuevamente.', 'error');
        }
    },
    
    /**
     * Sincronización manual
     */
    async manualSync() {
        const syncBtn = document.getElementById('admin-sync-btn');
        const originalText = syncBtn.innerHTML;
        syncBtn.innerHTML = '<span class="loading"></span> Sincronizando...';
        syncBtn.disabled = true;
        
        try {
            const result = await SUPABASE_CLIENT.syncPendingChanges();
            
            if (result.success) {
                showStatus(result.message, 'success');
                // Recargar datos frescos
                await SUPABASE_CLIENT.loadDataWithCache((data) => {
                    // Actualizar selects de la app principal
                    if (window.updateWorkFrontsFromAdmin) {
                        window.updateWorkFrontsFromAdmin(data);
                    }
                });
            } else {
                showStatus(result.message, 'warning');
            }
            
            // Re-renderizar panel con datos actualizados
            const container = document.getElementById('admin-panel-modal').querySelector('.modal-content');
            await this.renderPanel(container);
            
        } catch (error) {
            console.error('Sync error:', error);
            showStatus('Error de sincronización: ' + error.message, 'error');
        } finally {
            syncBtn.innerHTML = originalText;
            syncBtn.disabled = false;
        }
    },
    
    /**
     * Muestra el panel de administración
     */
    show() {
        console.log('Admin panel show() called');
        // Crear modal si no existe
        let modal = document.getElementById('admin-panel-modal');
        if (!modal) {
            console.log('Creating admin modal...');
            modal = document.createElement('div');
            modal.id = 'admin-panel-modal';
            modal.className = 'modal admin-modal';
            modal.innerHTML = '<div class="modal-content admin-modal-content"></div>';
            document.body.appendChild(modal);
            console.log('Admin modal created');
        }
        
        modal.classList.remove('hidden');
        console.log('Modal shown');
        const container = modal.querySelector('.modal-content');
        
        // Verificar sesión
        if (this.checkSession()) {
            console.log('Session valid, rendering panel');
            this.renderPanel(container);
        } else {
            this.renderLogin(container);
        }
    },
    
    /**
     * Oculta el panel
     */
    hide() {
        const modal = document.getElementById('admin-panel-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    
    /**
     * Toggle del panel (para el botón de admin)
     */
    toggle() {
        console.log('Admin panel toggle called');
        const modal = document.getElementById('admin-panel-modal');
        if (modal && !modal.classList.contains('hidden')) {
            this.hide();
        } else {
            this.show();
        }
    }
};

// Exponer globalmente
window.ADMIN_PANEL = ADMIN_PANEL;
console.log('Admin panel loaded successfully');

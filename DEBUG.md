# DEBUG - Solución de Problemas CAMARA-APP v20

## Problemas reportados y soluciones

### ❌ "Base de datos no lista. Recargue la página."

**Causa:** Conflicto entre dos sistemas de IndexedDB (el viejo y el nuevo).

**Solución aplicada:** 
- Modificado `initDB()` para que use la conexión de `DB_MANAGER`
- Agregados logs para verificar la inicialización

**Para verificar:**
1. Abre la consola del navegador (F12)
2. Recarga la página (Ctrl+F5)
3. Deberías ver estos logs en orden:
   ```
   Initializing app...
   Initializing DB_MANAGER...
   IndexedDB opened successfully
   DB_MANAGER initialized
   initDB completed
   App initialized successfully
   ```

### ❌ "No ingresa a la configuración" (botón admin no funciona)

**Causa posible:** Error de JavaScript o event listener no se agrega.

**Para debuggear:**
1. Abre la consola (F12)
2. Busca errores rojos
3. Haz clic en el botón ⚙️ (admin)
4. Deberías ver estos logs:
   ```
   Admin button clicked
   Admin panel toggle called
   Admin panel show() called
   Creating admin modal...
   Admin modal created
   Modal shown
   Rendering login form
   ```

**Si NO ves el log "Admin button clicked":**
- El botón no está encontrándose en el DOM
- Recarga con Ctrl+F5 para limpiar cache

**Si ves "ADMIN_PANEL not loaded":**
- El archivo admin-panel.js no se cargó
- Verifica en la pestaña Network que se descargue

## Pasos para limpiar todo y empezar de cero

### 1. Limpiar cache del navegador
```
Ctrl + Shift + Delete
→ Seleccionar "Imágenes y archivos en caché"
→ Borrar datos
```

### 2. Limpiar IndexedDB
```
F12 → Application → IndexedDB
→ Click derecho en GDR_CAM_DB → Delete database
```

### 3. Recargar forzado
```
Ctrl + F5 (Windows)
Cmd + Shift + R (Mac)
```

### 4. Verificar Service Worker
```
F12 → Application → Service Workers
→ Click en "Unregister"
→ Recargar página
```

## Logs esperados al cargar la app

Orden correcto de logs en consola:
```
Loading admin-panel.js...
Admin panel loaded successfully
Initializing app...
Initializing DB_MANAGER...
IndexedDB opened successfully
DB_MANAGER initialized
initDB completed
App initialized successfully
Initializing admin panel...
Admin button found: [object HTMLButtonElement]
```

## Si sigue sin funcionar...

1. Copia TODOS los logs de la consola (F12)
2. Copia los errores que aparecen en rojo
3. Envíamelos para revisar

## Comando rápido para limpiar todo

En la consola del navegador (F12), pega esto:
```javascript
// Limpiar IndexedDB
indexedDB.deleteDatabase('GDR_CAM_DB');
// Limpiar localStorage
localStorage.clear();
// Recargar
location.reload(true);
```

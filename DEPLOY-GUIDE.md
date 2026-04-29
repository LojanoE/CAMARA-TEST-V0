# ============================================
# GUÍA DE IMPLEMENTACIÓN EN PRODUCCIÓN
# CAMARA-APP v20 - Supabase Integration
# ============================================

## 1. CONFIGURACIÓN DE SUPABASE

### 1.1 Crear proyecto en Supabase
1. Ve a https://supabase.com
2. Crea un nuevo proyecto
3. Anota la URL y la anon key (ya las tienes configuradas en el código)

### 1.2 Ejecutar SQL de esquema
1. En tu dashboard de Supabase, ve a "SQL Editor"
2. Crea una "New query"
3. Copia y pega TODO el contenido del archivo `supabase-schema.sql`
4. Ejecuta (Run)

### 1.3 Verificar datos
Después de ejecutar el SQL, deberías ver:
```
Tabla frentes creada      | 43
Tabla actividades creada  | 19
```

## 2. DESPLIEGUE LOCAL (DESARROLLO/PRUEBAS)

### Opción A: Windows (recomendado)
```cmd
REM Doble clic en el archivo
start-server.bat
```

### Opción B: Comando manual
```cmd
cd C:\Users\LojanoE\Documents\GitHub\CAMARA-TEST-V0
python -m http.server 8000
```

Luego abre: http://localhost:8000

**IMPORTANTE:** Después de actualizar, limpia cache:
1. F12 → Console → pega: `indexedDB.deleteDatabase('GDR_CAM_DB'); localStorage.clear(); location.reload(true);`
2. F12 → Application → Service Workers → Unregister
3. Ctrl+F5

## 3. DESPLIEGUE EN SERVIDOR WEB (PRODUCCIÓN)

### 3.1 Subir archivos
Sube TODOS estos archivos a tu servidor web:
```
index.html
style.css
app.js
sw.js
connection-monitor.js
db-manager.js
supabase-client.js
admin-panel.js
supabase-schema.sql (opcional, para referencia)
exif.js
piexif.js
jszip.min.js
FileSaver.min.js
manifest.json
img/
  ├── LOGO GDR.jpeg
  └── icon-512x512.png
```

### 3.2 Configurar HTTPS (REQUERIDO)
La app requiere HTTPS para:
- Service Workers
- Cámara
- GPS preciso

## 4. VERIFICACIÓN POST-DESPLIEGUE

### 4.1 Primera carga
1. Abre la app
2. Verifica que aparezcan los frentes en el dropdown
3. El indicador de conexión (arriba a la derecha) debe mostrar estado

### 4.2 Panel de administración
1. Click en el ícono ⚙️ (arriba a la derecha)
2. Login: usuario `GDR`, contraseña `Mirador1`
3. Deberías ver pestañas "Frentes de Trabajo" y "Actividades"
4. Intenta agregar un nuevo frente

### 4.3 Modo offline
1. Desconecta internet
2. Recarga la página
3. Los frentes deberían seguir apareciendo (cache local)
4. El indicador debe mostrar "Sin conexión"

## 5. CONFIGURACIÓN DE SUPABASE (SEGURIDAD)

### 5.1 Revisar RLS Policies
En tu dashboard de Supabase:
1. Ve a "Database" → "Policies"
2. Verifica que existan las políticas:
   - "Frentes visibles para todos" (SELECT)
   - "Actividades visibles para todos" (SELECT)
   - Políticas de INSERT/UPDATE/DELETE

### 5.2 Opcional: Restringir escritura
Para mayor seguridad en producción, puedes:
1. Eliminar las políticas de INSERT/UPDATE/DELETE
2. Crear una Edge Function en Supabase para manejar escrituras
3. O usar una API key de servicio separada

## 6. SOLUCIÓN DE PROBLEMAS

### Problema: No cargan los frentes
- Verifica conexión a internet
- Abre DevTools (F12) → Console, busca errores
- Verifica que las tablas tengan datos en Supabase

### Problema: Error CORS
- Verifica que la URL de Supabase esté correcta en `supabase-client.js`
- La URL debe ser: `https://dzmhhlsttqygjvfabdxx.supabase.co`

### Problema: No funciona offline
- Verifica que el Service Worker se haya registrado
- En DevTools → Application → Service Workers
- Verifica que muestre "activated"

### Problema: Panel admin no abre
- Verifica que `admin-panel.js` se haya cargado
- En Console, escribe `ADMIN_PANEL` y verifica que exista

## 7. CONTACTO Y SOPORTE

Si encuentras problemas:
1. Revisa la consola del navegador (F12)
2. Verifica la pestaña Network para ver las llamadas a Supabase
3. Revisa el estado del Service Worker en Application → Service Workers

## URLS IMPORTANTES

- App local: http://localhost:8000
- Dashboard Supabase: https://app.supabase.com/project/dzmhhlsttqygjvfabdxx
- API REST: https://dzmhhlsttqygjvfabdxx.supabase.co/rest/v1/

## CREDENCIALES

- Admin: GDR / Mirador1
- Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  (ya está configurada en el código)

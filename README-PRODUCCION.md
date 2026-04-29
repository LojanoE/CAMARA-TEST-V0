# CAMARA-APP v20 - Instrucciones Rápidas

## 🚀 Iniciar en Local (Windows)

1. Abre la carpeta del proyecto en el Explorador
2. Doble clic en **`start-server.bat`**
3. Abre tu navegador en: http://localhost:8000

## 🗄️ Configurar Supabase (SOLO UNA VEZ)

1. Ve a https://supabase.com y entra a tu proyecto
2. Click en "SQL Editor" (barra lateral izquierda)
3. Click en "New query"
4. Abre el archivo `supabase-schema.sql` de este proyecto
5. Copia TODO el contenido y pégalo en el editor
6. Click en "Run"
7. ¡Listo! Las tablas y datos iniciales están creados

## 🔑 Acceso Admin

- Click en el ícono ⚙️ (arriba a la derecha)
- Usuario: `GDR`
- Contraseña: `Mirador1`

## 📋 Checklist de Producción

- [ ] Ejecutar SQL en Supabase
- [ ] Probar servidor local con `start-server.bat`
- [ ] Verificar que carguen los frentes
- [ ] Probar panel admin (login GDR/Mirador1)
- [ ] Probar modo offline (desconectar wifi y recargar)
- [ ] Subir todos los archivos al servidor web

## ❓ ¿Problemas?

Revisa el archivo `DEPLOY-GUIDE.md` para solución detallada de problemas.

## 📁 Archivos Importantes

| Archivo | Propósito |
|---------|-----------|
| `start-server.bat` | Inicia servidor local (Windows) |
| `supabase-schema.sql` | Esquema de base de datos |
| `DEPLOY-GUIDE.md` | Guía completa de despliegue |

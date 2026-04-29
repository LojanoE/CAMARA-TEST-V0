@echo off
echo ==========================================
echo  CAMARA-APP v20 - Servidor de Produccion
echo ==========================================
echo.

echo Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en PATH
    echo Por favor instala Python desde https://python.org
    pause
    exit /b 1
)

echo [OK] Python encontrado
echo.

if not exist "index.html" (
    echo [ERROR] No se encontro index.html
    echo Asegurate de ejecutar este script desde la carpeta del proyecto
    pause
    exit /b 1
)

echo [OK] Archivos del proyecto encontrados
echo.
echo Iniciando servidor en http://localhost:8000
echo Presiona Ctrl+C para detener
echo.
echo ==========================================
echo.

python -m http.server 8000

if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo iniciar el servidor
    pause
)

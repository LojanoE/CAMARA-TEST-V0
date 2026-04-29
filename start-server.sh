#!/bin/bash

echo "=========================================="
echo " CAMARA-APP v20 - Servidor de Producción"
echo "=========================================="
echo ""

# Verificar Python
echo "Verificando Python..."
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[ERROR] Python no está instalado"
    echo "Por favor instala Python desde https://python.org"
    exit 1
fi

echo "[OK] Python encontrado"
echo ""

# Verificar archivos
if [ ! -f "index.html" ]; then
    echo "[ERROR] No se encontró index.html"
    echo "Asegúrate de ejecutar este script desde la carpeta del proyecto"
    exit 1
fi

echo "[OK] Archivos del proyecto encontrados"
echo ""

# Iniciar servidor
echo "Iniciando servidor en http://localhost:8000"
echo "Presiona Ctrl+C para detener"
echo ""
echo "=========================================="
echo ""

# Intentar con python3 primero, luego python
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
else
    python -m http.server 8000
fi

#!/bin/bash
# Script de Sincronización Local (Soberanía de Datos)
# Ejecuta este script desde tu MAC para descargar los backups del VPS.

# Configuración
# Reemplaza con la IP real de tu VPS
VPS_USER="root"
VPS_HOST="148.230.88.203"
REMOTE_BACKUP_DIR="/var/www/backups"

# Detectar directorio real del script para poder ejecutarlo desde cron/launchd sin errores
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOCAL_BACKUP_DIR="$SCRIPT_DIR/../backups_offsite"

# Colores
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}[Sync] Iniciando sincronización segura desde EXTRACTOS EUM VPS...${NC}"

# Crear directorio local si no existe
mkdir -p "$LOCAL_BACKUP_DIR/db"
mkdir -p "$LOCAL_BACKUP_DIR/storage"

# 1. Sincronizar Base de Datos (Solo archivos nuevos)
echo -e "${GREEN}[Sync] Descargando backups de Base de Datos...${NC}"
rsync -avz --progress -e ssh \
    "$VPS_USER@$VPS_HOST:$REMOTE_BACKUP_DIR/db/" \
    "$LOCAL_BACKUP_DIR/db/"

# 2. Sincronizar Storage (Archivos espejo)
echo -e "${GREEN}[Sync] Descargando espejo de archivos (COAs/Evidencias)...${NC}"
rsync -avz --progress -e ssh \
    "$VPS_USER@$VPS_HOST:$REMOTE_BACKUP_DIR/storage/" \
    "$LOCAL_BACKUP_DIR/storage/"

echo -e "${GREEN}[Sync] ✅ Sincronización completada exitosamente.${NC}"
echo -e "${GREEN}[Sync] Tus datos están seguros en: $LOCAL_BACKUP_DIR${NC}"

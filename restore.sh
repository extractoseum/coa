#!/bin/bash

# COA Viewer 2.0 - Sistema de Restauración
# Este script restaura un backup del proyecto

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKUP_DIR="backups"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   COA Viewer 2.0 - Sistema de Restauración${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Verificar si se proporcionó un nombre de backup
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Debes especificar el nombre del backup${NC}"
    echo ""
    echo -e "${YELLOW}Uso:${NC}"
    echo -e "  ./restore.sh ${BLUE}nombre_del_backup${NC}"
    echo ""
    echo -e "${YELLOW}Backups disponibles:${NC}"
    ls -1 "$BACKUP_DIR" | grep -E "coa_viewer_backup_.*\\.tar\\.gz|coa_viewer_backup_[0-9]" | sed 's/.tar.gz//'
    echo ""
    exit 1
fi

BACKUP_NAME=$1
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
BACKUP_TAR="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Verificar si el backup existe
if [ ! -d "$BACKUP_PATH" ] && [ ! -f "$BACKUP_TAR" ]; then
    echo -e "${RED}❌ Error: El backup '${BACKUP_NAME}' no existe${NC}"
    echo ""
    echo -e "${YELLOW}Backups disponibles:${NC}"
    ls -1 "$BACKUP_DIR" | grep -E "coa_viewer_backup_.*\\.tar\\.gz|coa_viewer_backup_[0-9]" | sed 's/.tar.gz//'
    echo ""
    exit 1
fi

# Descomprimir si es necesario
if [ ! -d "$BACKUP_PATH" ] && [ -f "$BACKUP_TAR" ]; then
    echo -e "${YELLOW}📦 Descomprimiendo backup...${NC}"
    cd "$BACKUP_DIR"
    tar -xzf "${BACKUP_NAME}.tar.gz"
    cd ..
    echo -e "${GREEN}✓${NC} Backup descomprimido"
    echo ""
fi

# Mostrar información del backup
if [ -f "$BACKUP_PATH/BACKUP_INFO.txt" ]; then
    echo -e "${BLUE}📋 Información del backup:${NC}"
    cat "$BACKUP_PATH/BACKUP_INFO.txt"
    echo ""
fi

# Confirmar restauración
echo -e "${YELLOW}⚠️  ADVERTENCIA: Esta operación sobrescribirá los archivos actuales${NC}"
echo -e "${YELLOW}   Se creará un backup automático del estado actual antes de restaurar${NC}"
echo ""
read -p "¿Deseas continuar? (s/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[SsYy]$ ]]; then
    echo -e "${YELLOW}❌ Restauración cancelada${NC}"
    exit 1
fi

# Crear backup del estado actual antes de restaurar
echo ""
echo -e "${YELLOW}📦 Creando backup de seguridad del estado actual...${NC}"
./backup.sh > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Backup de seguridad creado"
echo ""

# Restaurar archivos
echo -e "${BLUE}Restaurando archivos...${NC}"
echo ""

restore_with_status() {
    local source=$1
    local dest=$2
    local name=$3

    if [ -e "$source" ]; then
        # Crear directorio destino si no existe
        mkdir -p "$(dirname "$dest")"

        # Copiar archivos
        cp -r "$source" "$dest"
        echo -e "${GREEN}✓${NC} $name"
    else
        echo -e "${YELLOW}⚠${NC} $name (no encontrado en backup)"
    fi
}

# Restaurar frontend
echo -e "${BLUE}Restaurando frontend...${NC}"
restore_with_status "$BACKUP_PATH/frontend/src" "frontend/" "Código fuente frontend"
restore_with_status "$BACKUP_PATH/frontend/package.json" "frontend/" "package.json"
restore_with_status "$BACKUP_PATH/frontend/package-lock.json" "frontend/" "package-lock.json"
restore_with_status "$BACKUP_PATH/frontend/tsconfig.json" "frontend/" "tsconfig.json"
restore_with_status "$BACKUP_PATH/frontend/vite.config.ts" "frontend/" "vite.config.ts"
restore_with_status "$BACKUP_PATH/frontend/index.html" "frontend/" "index.html"
restore_with_status "$BACKUP_PATH/frontend/tailwind.config.js" "frontend/" "tailwind.config.js"
restore_with_status "$BACKUP_PATH/frontend/postcss.config.js" "frontend/" "postcss.config.js"

echo ""
echo -e "${BLUE}Restaurando backend...${NC}"
restore_with_status "$BACKUP_PATH/backend/src" "backend/" "Código fuente backend"
restore_with_status "$BACKUP_PATH/backend/package.json" "backend/" "package.json"
restore_with_status "$BACKUP_PATH/backend/package-lock.json" "backend/" "package-lock.json"
restore_with_status "$BACKUP_PATH/backend/tsconfig.json" "backend/" "tsconfig.json"

# .env solo si no existe (no sobrescribir)
if [ -f "$BACKUP_PATH/backend/.env" ] && [ ! -f "backend/.env" ]; then
    restore_with_status "$BACKUP_PATH/backend/.env" "backend/" "Variables de entorno"
else
    echo -e "${YELLOW}⚠${NC} Variables de entorno (preservadas, no sobrescritas)"
fi

echo ""
echo -e "${BLUE}Restaurando SQL...${NC}"
if ls "$BACKUP_PATH/backend/"*.sql 1> /dev/null 2>&1; then
    cp "$BACKUP_PATH/backend/"*.sql "backend/" 2>/dev/null
    echo -e "${GREEN}✓${NC} Archivos SQL"
fi

echo ""
echo -e "${BLUE}Restaurando documentación...${NC}"
restore_with_status "$BACKUP_PATH/CAMBIOS_REALIZADOS.md" "./" "Documentación de cambios"
restore_with_status "$BACKUP_PATH/README.md" "./" "README"

# Limpiar caché de Vite
echo ""
echo -e "${YELLOW}🧹 Limpiando caché de Vite...${NC}"
rm -rf frontend/node_modules/.vite
echo -e "${GREEN}✓${NC} Caché limpiada"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ RESTAURACIÓN COMPLETADA EXITOSAMENTE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}🔄 Próximos pasos:${NC}"
echo -e "  1. Reinicia el servidor frontend: ${BLUE}cd frontend && npm run dev${NC}"
echo -e "  2. Reinicia el servidor backend: ${BLUE}cd backend && npm run dev${NC}"
echo -e "  3. Recarga la página en el navegador (Cmd+Shift+R)"
echo ""
echo -e "${YELLOW}💡 Nota:${NC} Se creó un backup automático del estado previo"
echo ""

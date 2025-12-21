#!/bin/bash

# COA Viewer 2.0 - Sistema de Backup
# Este script crea un backup completo del proyecto funcional

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Directorio de backups
BACKUP_DIR="backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="coa_viewer_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   COA Viewer 2.0 - Sistema de Backup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Crear directorio de backups si no existe
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}📁 Creando directorio de backups...${NC}"
    mkdir -p "$BACKUP_DIR"
fi

# Crear directorio para este backup
echo -e "${YELLOW}📦 Creando backup: ${BACKUP_NAME}${NC}"
mkdir -p "$BACKUP_PATH"

# Función para copiar archivos
copy_with_status() {
    local source=$1
    local dest=$2
    local name=$3

    if [ -e "$source" ]; then
        cp -r "$source" "$dest"
        echo -e "${GREEN}✓${NC} $name"
    else
        echo -e "${YELLOW}⚠${NC} $name (no existe, omitiendo)"
    fi
}

echo ""
echo -e "${BLUE}Copiando archivos del frontend...${NC}"
# Frontend files
copy_with_status "frontend/src" "$BACKUP_PATH/frontend/src" "Código fuente frontend"
copy_with_status "frontend/package.json" "$BACKUP_PATH/frontend/" "package.json"
copy_with_status "frontend/package-lock.json" "$BACKUP_PATH/frontend/" "package-lock.json"
copy_with_status "frontend/tsconfig.json" "$BACKUP_PATH/frontend/" "tsconfig.json"
copy_with_status "frontend/vite.config.ts" "$BACKUP_PATH/frontend/" "vite.config.ts"
copy_with_status "frontend/index.html" "$BACKUP_PATH/frontend/" "index.html"
copy_with_status "frontend/tailwind.config.js" "$BACKUP_PATH/frontend/" "tailwind.config.js"
copy_with_status "frontend/postcss.config.js" "$BACKUP_PATH/frontend/" "postcss.config.js"

echo ""
echo -e "${BLUE}Copiando archivos del backend...${NC}"
# Backend files
copy_with_status "backend/src" "$BACKUP_PATH/backend/src" "Código fuente backend"
copy_with_status "backend/package.json" "$BACKUP_PATH/backend/" "package.json"
copy_with_status "backend/package-lock.json" "$BACKUP_PATH/backend/" "package-lock.json"
copy_with_status "backend/tsconfig.json" "$BACKUP_PATH/backend/" "tsconfig.json"
copy_with_status "backend/.env" "$BACKUP_PATH/backend/" "Variables de entorno"

echo ""
echo -e "${BLUE}Copiando archivos SQL...${NC}"
# SQL files
copy_with_status "backend/*.sql" "$BACKUP_PATH/backend/" "Archivos SQL"

echo ""
echo -e "${BLUE}Copiando documentación...${NC}"
# Documentation
copy_with_status "CAMBIOS_REALIZADOS.md" "$BACKUP_PATH/" "Documentación de cambios"
copy_with_status "README.md" "$BACKUP_PATH/" "README"

# Crear archivo de metadata
echo -e "${BLUE}Creando metadata del backup...${NC}"
cat > "$BACKUP_PATH/BACKUP_INFO.txt" << EOF
╔═══════════════════════════════════════════════════╗
║     COA Viewer 2.0 - Información del Backup      ║
╚═══════════════════════════════════════════════════╝

📅 Fecha: $(date +"%Y-%m-%d %H:%M:%S")
💾 Nombre: ${BACKUP_NAME}
📁 Ubicación: ${BACKUP_PATH}

📋 CONTENIDO:
├── frontend/
│   ├── src/          (Código fuente completo)
│   └── configs       (Configuraciones)
├── backend/
│   ├── src/          (Código fuente completo)
│   ├── .env          (Variables de entorno)
│   └── *.sql         (Scripts SQL)
└── docs/             (Documentación)

🔧 VERSIÓN DEL SISTEMA:
- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Base de datos: Supabase (PostgreSQL)

✅ CARACTERÍSTICAS INCLUIDAS:
- Sistema de badges funcional
- Cumplimiento THC 1% (México)
- Tarjeta de cannabinoide principal
- Número único de COA (EUM_XXXXX_COA)
- Nombre personalizado del certificado
- Editor de información básica (custom_name, coa_number)
- Dark theme hardcodeado

📝 NOTAS:
Para restaurar este backup, ejecuta:
./restore.sh ${BACKUP_NAME}

EOF

echo -e "${GREEN}✓${NC} Metadata creada"

# Comprimir backup (opcional)
echo ""
echo -e "${YELLOW}🗜️  Comprimiendo backup...${NC}"
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
TAR_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo -e "${GREEN}✓${NC} Backup comprimido: ${BACKUP_NAME}.tar.gz (${TAR_SIZE})"

# Eliminar carpeta sin comprimir (opcional, puedes comentar esta línea)
# rm -rf "$BACKUP_NAME"

cd ..

# Resumen
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ BACKUP COMPLETADO EXITOSAMENTE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "📦 Backup guardado en: ${BLUE}${BACKUP_PATH}${NC}"
echo -e "🗜️  Archivo comprimido: ${BLUE}${BACKUP_DIR}/${BACKUP_NAME}.tar.gz${NC}"
echo -e "📄 Tamaño: ${BLUE}${TAR_SIZE}${NC}"
echo ""
echo -e "${YELLOW}💡 Para restaurar este backup:${NC}"
echo -e "   ${BLUE}./restore.sh ${BACKUP_NAME}${NC}"
echo ""
echo -e "${YELLOW}💡 Para listar todos los backups:${NC}"
echo -e "   ${BLUE}./list-backups.sh${NC}"
echo ""

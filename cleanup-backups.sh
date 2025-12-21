#!/bin/bash

# COA Viewer 2.0 - Limpieza de Backups
# Este script elimina backups antiguos manteniendo los más recientes

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKUP_DIR="backups"
KEEP_LAST=5  # Mantener los últimos N backups

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   COA Viewer 2.0 - Limpieza de Backups${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Verificar si existe el directorio de backups
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}⚠️  No hay backups para limpiar${NC}"
    echo ""
    exit 0
fi

# Contar backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR" | grep -E "coa_viewer_backup_[0-9]" | wc -l | tr -d ' ')

if [ "$BACKUP_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No hay backups para limpiar${NC}"
    echo ""
    exit 0
fi

echo -e "${BLUE}📊 Estadísticas:${NC}"
echo -e "   Total de backups: ${YELLOW}${BACKUP_COUNT}${NC}"
echo -e "   Backups a mantener: ${GREEN}${KEEP_LAST}${NC}"

if [ "$BACKUP_COUNT" -le "$KEEP_LAST" ]; then
    echo ""
    echo -e "${GREEN}✓${NC} No hay backups que eliminar"
    echo -e "${YELLOW}  Todos los backups actuales serán preservados${NC}"
    echo ""
    exit 0
fi

BACKUPS_TO_DELETE=$((BACKUP_COUNT - KEEP_LAST))
echo -e "   Backups a eliminar: ${RED}${BACKUPS_TO_DELETE}${NC}"
echo ""

# Listar backups que serán eliminados
echo -e "${YELLOW}Los siguientes backups serán ELIMINADOS:${NC}"
echo ""

counter=1
for backup in $(ls -1t "$BACKUP_DIR" | grep -E "coa_viewer_backup_[0-9]" | tail -n "$BACKUPS_TO_DELETE"); do
    # Extraer timestamp del nombre
    timestamp=$(echo "$backup" | sed 's/coa_viewer_backup_//' | sed 's/.tar.gz//')

    # Formatear fecha
    year="${timestamp:0:4}"
    month="${timestamp:4:2}"
    day="${timestamp:6:2}"
    hour="${timestamp:9:2}"
    minute="${timestamp:11:2}"
    second="${timestamp:13:2}"

    formatted_date="${day}/${month}/${year} ${hour}:${minute}:${second}"

    # Obtener tamaño
    if [ -f "$BACKUP_DIR/${backup}.tar.gz" ]; then
        size=$(du -h "$BACKUP_DIR/${backup}.tar.gz" | cut -f1)
    elif [ -d "$BACKUP_DIR/${backup}" ]; then
        size=$(du -sh "$BACKUP_DIR/${backup}" | cut -f1)
    else
        size="N/A"
    fi

    echo -e "${RED}${counter}.${NC} ${backup}"
    echo -e "   📅 ${formatted_date} | 💾 ${size}"
    echo ""

    counter=$((counter + 1))
done

echo -e "${YELLOW}Los siguientes backups serán PRESERVADOS:${NC}"
echo ""

counter=1
for backup in $(ls -1t "$BACKUP_DIR" | grep -E "coa_viewer_backup_[0-9]" | head -n "$KEEP_LAST"); do
    # Extraer timestamp del nombre
    timestamp=$(echo "$backup" | sed 's/coa_viewer_backup_//' | sed 's/.tar.gz//')

    # Formatear fecha
    year="${timestamp:0:4}"
    month="${timestamp:4:2}"
    day="${timestamp:6:2}"
    hour="${timestamp:9:2}"
    minute="${timestamp:11:2}"
    second="${timestamp:13:2}"

    formatted_date="${day}/${month}/${year} ${hour}:${minute}:${second}"

    # Obtener tamaño
    if [ -f "$BACKUP_DIR/${backup}.tar.gz" ]; then
        size=$(du -h "$BACKUP_DIR/${backup}.tar.gz" | cut -f1)
    elif [ -d "$BACKUP_DIR/${backup}" ]; then
        size=$(du -sh "$BACKUP_DIR/${backup}" | cut -f1)
    else
        size="N/A"
    fi

    echo -e "${GREEN}${counter}.${NC} ${backup}"
    echo -e "   📅 ${formatted_date} | 💾 ${size}"
    echo ""

    counter=$((counter + 1))
done

# Confirmar eliminación
echo -e "${RED}⚠️  ADVERTENCIA: Esta operación no se puede deshacer${NC}"
echo ""
read -p "¿Deseas continuar con la limpieza? (s/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[SsYy]$ ]]; then
    echo -e "${YELLOW}❌ Limpieza cancelada${NC}"
    exit 1
fi

# Eliminar backups antiguos
echo ""
echo -e "${YELLOW}🗑️  Eliminando backups antiguos...${NC}"
echo ""

deleted_count=0
freed_space=0

for backup in $(ls -1t "$BACKUP_DIR" | grep -E "coa_viewer_backup_[0-9]" | tail -n "$BACKUPS_TO_DELETE"); do
    # Eliminar carpeta
    if [ -d "$BACKUP_DIR/${backup}" ]; then
        rm -rf "$BACKUP_DIR/${backup}"
        echo -e "${GREEN}✓${NC} Eliminado: ${backup}"
        deleted_count=$((deleted_count + 1))
    fi

    # Eliminar archivo comprimido
    if [ -f "$BACKUP_DIR/${backup}.tar.gz" ]; then
        rm -f "$BACKUP_DIR/${backup}.tar.gz"
        echo -e "${GREEN}✓${NC} Eliminado: ${backup}.tar.gz"
    fi
done

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ LIMPIEZA COMPLETADA${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "🗑️  Backups eliminados: ${RED}${deleted_count}${NC}"
echo -e "✅ Backups preservados: ${GREEN}${KEEP_LAST}${NC}"
echo ""

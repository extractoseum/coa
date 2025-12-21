#!/bin/bash

# COA Viewer 2.0 - Listar Backups
# Este script lista todos los backups disponibles

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKUP_DIR="backups"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   COA Viewer 2.0 - Backups Disponibles${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Verificar si existe el directorio de backups
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}⚠️  No hay backups disponibles${NC}"
    echo -e "${YELLOW}   Crea tu primer backup con:${NC} ${BLUE}./backup.sh${NC}"
    echo ""
    exit 0
fi

# Contar backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR" | grep -E "coa_viewer_backup_.*\\.tar\\.gz|coa_viewer_backup_[0-9]" | wc -l | tr -d ' ')

if [ "$BACKUP_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No hay backups disponibles${NC}"
    echo -e "${YELLOW}   Crea tu primer backup con:${NC} ${BLUE}./backup.sh${NC}"
    echo ""
    exit 0
fi

echo -e "${GREEN}📦 Total de backups: ${BACKUP_COUNT}${NC}"
echo ""

# Listar backups con detalles
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              BACKUPS DISPONIBLES                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

counter=1
for backup in $(ls -1t "$BACKUP_DIR" | grep -E "coa_viewer_backup_[0-9]"); do
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
        backup_file="${backup}.tar.gz"
    elif [ -d "$BACKUP_DIR/${backup}" ]; then
        size=$(du -sh "$BACKUP_DIR/${backup}" | cut -f1)
        backup_file="${backup}"
    else
        size="N/A"
        backup_file="${backup}"
    fi

    echo -e "${YELLOW}${counter}.${NC} ${GREEN}${backup}${NC}"
    echo -e "   📅 Fecha: ${formatted_date}"
    echo -e "   💾 Tamaño: ${size}"

    # Mostrar info si existe
    if [ -f "$BACKUP_DIR/${backup}/BACKUP_INFO.txt" ]; then
        echo -e "   ℹ️  Info disponible"
    fi

    echo -e "   ${BLUE}Restaurar:${NC} ./restore.sh ${backup}"
    echo ""

    counter=$((counter + 1))
done

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}💡 Comandos útiles:${NC}"
echo -e "  ${BLUE}./backup.sh${NC}                  - Crear nuevo backup"
echo -e "  ${BLUE}./restore.sh [nombre]${NC}        - Restaurar un backup"
echo -e "  ${BLUE}./cleanup-backups.sh${NC}         - Limpiar backups antiguos"
echo ""

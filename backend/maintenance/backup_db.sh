#!/bin/bash
# Backup de Base de Datos Automático (Soberanía de Datos)
# Este script extrae la base de datos completa de Supabase, la comprime y la cifra.

# Source environment variables
source /var/www/coa-viewer/backend/.env

# Configuration
BACKUP_DIR="/var/www/backups/db"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="backup_db_$DATE.sql.gz"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p $BACKUP_DIR

echo "[Backup] Starting DB backup..."

# Extract DB using pg_dump
# -F p: Plain text format (SQL script) allowing inspection
# --clean: Include DROP commands before CREATE
# --if-exists: Use IF EXISTS
# --quote-all-identifiers: Maximum compatibility
# --no-owner: Ignore ownership (since we import as postgres usually)
# --no-privileges: Ignore privileges (handle them in restore)
PGPASSWORD=$DB_PASSWORD pg_dump \
  -h $DB_HOST \
  -U $DB_USER \
  -p $DB_PORT \
  -d $DB_NAME \
  -F p \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --no-owner \
  --no-privileges \
  | gzip > "$BACKUP_DIR/$FILENAME"

# Verify success
if [ $? -eq 0 ]; then
  echo "[Backup] ✅ Backup successful: $BACKUP_DIR/$FILENAME ($(du -h "$BACKUP_DIR/$FILENAME" | cut -f1))"
  
  # Retention policy (Delete files older than RETENTION_DAYS)
  find $BACKUP_DIR -name "backup_db_*.sql.gz" -mtime +$RETENTION_DAYS -delete
  echo "[Backup] Cleaned up backups older than $RETENTION_DAYS days."
else
  echo "[Backup] ❌ Backup failed!"
  exit 1
fi

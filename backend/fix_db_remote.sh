#!/bin/bash
DB_URL="postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres"

echo "Current Constraints:"
psql "$DB_URL" -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'crm_messages'::regclass;"

echo "Fixing constraints..."
psql "$DB_URL" -c "ALTER TABLE crm_messages DROP CONSTRAINT IF EXISTS crm_messages_message_type_check;"
psql "$DB_URL" -c "ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_message_type_check CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'template', 'event', 'sticker'));"

echo "New Constraints:"
psql "$DB_URL" -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'crm_messages'::regclass;"

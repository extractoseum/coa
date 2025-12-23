-- Migration: 044_maintenance_fixes.sql (CRM Debug Report Fixes)

-- 1. Add missing message types
-- Dropping constraint first to avoid errors if it exists with different name or values
ALTER TABLE crm_messages DROP CONSTRAINT IF EXISTS crm_messages_message_type_check;

ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_message_type_check
CHECK (message_type IN (
    'text', 
    'image', 
    'video', 
    'audio', 
    'file', 
    'template', 
    'event', 
    'sticker', 
    'call_summary'
));

-- 2. Add missing conversation status
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
CHECK (status IN (
    'active', 
    'paused', 
    'review', 
    'archived', 
    'closed'
));

-- 3. Add missing index for performance lookup
CREATE INDEX IF NOT EXISTS idx_crm_messages_external_id
ON crm_messages(external_id) WHERE external_id IS NOT NULL;

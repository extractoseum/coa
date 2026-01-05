-- Migration 054: Message Types Extended
-- Expands message_type constraint to support WhatsApp rich interactions.

-- 1. Check if constraint exists and drop it
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'crm_messages' AND constraint_name = 'crm_messages_message_type_check'
    ) THEN
        ALTER TABLE crm_messages DROP CONSTRAINT crm_messages_message_type_check;
    END IF;
END $$;

-- 2. Add updated constraint
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_message_type_check 
CHECK (message_type IN (
    'text', 'image', 'video', 'audio', 'file', 
    'template', 'event', 'sticker', 'location', 
    'contact', 'poll', 'order', 'link_preview', 
    'button', 'interactive', 'reaction', 'call'
));

-- 3. Add column for raw metadata (Phase 61: Message Hardening)
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin ON crm_messages USING GIN (metadata);

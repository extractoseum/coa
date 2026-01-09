-- Migration: CRM Internal Notes & Message Enhancements
-- Created: 2025-01-09
-- Description: Add internal notes system, reply_to for quoting, and AI feedback

-- 1. Add new columns to crm_messages
ALTER TABLE crm_messages
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES crm_messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ai_feedback TEXT CHECK (ai_feedback IN ('positive', 'negative', NULL)),
ADD COLUMN IF NOT EXISTS ai_feedback_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sent_by_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 2. Create index for internal notes queries
CREATE INDEX IF NOT EXISTS idx_messages_is_internal ON crm_messages(conversation_id, is_internal) WHERE is_internal = true;

-- 3. Create index for scheduled messages
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON crm_messages(scheduled_for) WHERE scheduled_for IS NOT NULL AND status = 'queued';

-- 4. Create index for AI feedback analytics
CREATE INDEX IF NOT EXISTS idx_messages_ai_feedback ON crm_messages(ai_feedback) WHERE ai_feedback IS NOT NULL;

-- 5. Add comment for clarity
COMMENT ON COLUMN crm_messages.is_internal IS 'If true, this message is an internal note visible only to staff, not sent to the customer';
COMMENT ON COLUMN crm_messages.reply_to_id IS 'Reference to the message being replied to (for quote/reply functionality)';
COMMENT ON COLUMN crm_messages.ai_feedback IS 'User feedback on AI-generated messages: positive (thumbs up) or negative (thumbs down)';
COMMENT ON COLUMN crm_messages.scheduled_for IS 'If set, message will be sent at this time instead of immediately';
COMMENT ON COLUMN crm_messages.sent_by_id IS 'The staff/admin who sent this message (for audit trail)';

-- 6. Update message_type constraint to include 'internal_note'
ALTER TABLE crm_messages DROP CONSTRAINT IF EXISTS crm_messages_message_type_check;
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_message_type_check
CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'template', 'event', 'reaction', 'sticker', 'internal_note'));

-- Migration: Conversation Tags System
-- Created: 2025-01-09
-- Description: Adds tags array to conversations for categorization (VIP, Queja, Nuevo, etc.)

-- Add tags column to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create index for fast tag filtering
CREATE INDEX IF NOT EXISTS idx_conversations_tags ON conversations USING GIN (tags);

-- Comment
COMMENT ON COLUMN conversations.tags IS 'Array of tags for categorization (VIP, Queja, Nuevo, Urgente, etc.)';

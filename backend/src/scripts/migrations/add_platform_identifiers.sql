-- =====================================================
-- MIGRATION: Add Multi-Platform Identifiers to CRM
-- Purpose: Support Instagram, Facebook Messenger, TikTok, etc.
-- =====================================================

-- 1. Add platform-specific identifiers to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS messenger_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vambe_contact_id VARCHAR(255);

-- 2. Add external platform data storage (JSON for flexibility)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS platform_metadata JSONB DEFAULT '{}';

-- 3. Add indexes for fast lookup by platform ID
CREATE INDEX IF NOT EXISTS idx_clients_instagram_id ON clients(instagram_id) WHERE instagram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_facebook_id ON clients(facebook_id) WHERE facebook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_messenger_id ON clients(messenger_id) WHERE messenger_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_vambe_contact_id ON clients(vambe_contact_id) WHERE vambe_contact_id IS NOT NULL;

-- 4. Add platform source tracking to conversations (if not exists)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform VARCHAR(50);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform_thread_id VARCHAR(255);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS platform_user_id VARCHAR(255);

-- 5. Create index on conversations platform fields
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(platform) WHERE platform IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_platform_user ON conversations(platform_user_id) WHERE platform_user_id IS NOT NULL;

-- 6. Add comments for documentation
COMMENT ON COLUMN clients.instagram_id IS 'Instagram Scoped User ID (IGSID) from Meta Graph API';
COMMENT ON COLUMN clients.instagram_username IS 'Instagram @username';
COMMENT ON COLUMN clients.facebook_id IS 'Facebook Page-Scoped User ID (PSID)';
COMMENT ON COLUMN clients.messenger_id IS 'Messenger User ID';
COMMENT ON COLUMN clients.tiktok_id IS 'TikTok User ID';
COMMENT ON COLUMN clients.vambe_contact_id IS 'Legacy Vambe Contact ID for migration';
COMMENT ON COLUMN clients.platform_metadata IS 'JSON storage for additional platform-specific data';

-- =====================================================
-- VERIFICATION QUERIES (run after migration)
-- =====================================================

-- Check columns were added:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'clients'
-- AND column_name IN ('instagram_id', 'facebook_id', 'messenger_id', 'tiktok_id', 'vambe_contact_id');

-- Check indexes were created:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'clients' AND indexname LIKE 'idx_clients_%';

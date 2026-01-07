-- 059_vibe_marketing_columns.sql
-- Add vibe columns to shopify_customers_backup for Marketing Empático filtering
-- These columns are synced from CRM conversation analysis

-- Add vibe columns to shopify_customers_backup
ALTER TABLE shopify_customers_backup
ADD COLUMN IF NOT EXISTS vibe_category TEXT,          -- frustrated, excited, anxious, satisfied, neutral
ADD COLUMN IF NOT EXISTS friction_level TEXT,         -- high, medium, low
ADD COLUMN IF NOT EXISTS intent_level TEXT,           -- hot, warm, cold
ADD COLUMN IF NOT EXISTS friction_score INTEGER,      -- 0-100
ADD COLUMN IF NOT EXISTS intent_score INTEGER,        -- 0-100
ADD COLUMN IF NOT EXISTS emotional_vibe TEXT,         -- Raw vibe text from AI
ADD COLUMN IF NOT EXISTS vibe_updated_at TIMESTAMP WITH TIME ZONE;

-- Index for fast vibe-based filtering
CREATE INDEX IF NOT EXISTS idx_shopify_customers_vibe_category ON shopify_customers_backup(vibe_category);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_friction_level ON shopify_customers_backup(friction_level);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_intent_level ON shopify_customers_backup(intent_level);

-- Comments
COMMENT ON COLUMN shopify_customers_backup.vibe_category IS 'Categorized emotional state: frustrated, excited, anxious, satisfied, neutral';
COMMENT ON COLUMN shopify_customers_backup.friction_level IS 'Customer friction level: high (avoid promos), medium, low (good for promos)';
COMMENT ON COLUMN shopify_customers_backup.intent_level IS 'Purchase intent: hot (ready to buy), warm (interested), cold (browsing)';

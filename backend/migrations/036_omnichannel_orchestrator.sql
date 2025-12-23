-- Migration: Omnichannel Orchestrator Infrastructure
-- Created: 2025-12-22
-- Description: Phase 0 of the Blueprint. Implements Chips and Extended Configs.

-- 1. Create Channel Chips table (Capa 1)
CREATE TABLE IF NOT EXISTS channel_chips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., "whatsapp_1", "instagram_ads"
    platform VARCHAR(20) NOT NULL,          -- e.g., "whatsapp", "instagram", "facebook", "email"
    account_reference VARCHAR(100),         -- e.g., "+52XXXXXXXXXX"
    traffic_source VARCHAR(20),             -- e.g., "ads", "organic", "referral", "direct"
    expected_intent VARCHAR(30),            -- e.g., "ventas", "soporte", "b2b", "info"
    default_entry_column_id UUID REFERENCES crm_columns(id) ON DELETE SET NULL,
    default_agent_id VARCHAR(50),           -- Maps to ai_knowledge_base folder name
    ruleset JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Mini-Chips table (Capa 2)
CREATE TABLE IF NOT EXISTS mini_chips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chip_type VARCHAR(20) NOT NULL,         -- "tag", "geo", "intent", "mood", "score"
    key VARCHAR(50) NOT NULL,               -- "B2B", "VIP", "frustrated", "CDMX"
    trigger_type VARCHAR(20),               -- "event", "message", "ai_inference"
    trigger_config JSONB DEFAULT '{}'::jsonb, -- e.g., { "pattern": "urgente", "threshold": 0.8 }
    actions JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ "type": "move_column", "target": "UUID" }]
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Junction Table: Conversation Chips
CREATE TABLE IF NOT EXISTS conversation_chips (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    chip_id UUID REFERENCES mini_chips(id) ON DELETE CASCADE,
    confidence DECIMAL(3,2) DEFAULT 1.0,
    metadata JSONB DEFAULT '{}'::jsonb,     -- Store dynamic data (e.g., { "city": "CDMX" })
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, chip_id)
);

-- 4. Extend crm_columns with Strategies (Capa 3)
ALTER TABLE crm_columns 
ADD COLUMN IF NOT EXISTS extended_config JSONB DEFAULT '{}'::jsonb;

-- 5. Extend conversations for deep routing
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
ADD COLUMN IF NOT EXISTS traffic_source VARCHAR(20),
ADD COLUMN IF NOT EXISTS channel_chip_id UUID REFERENCES channel_chips(id) ON DELETE SET NULL;

-- 6. Relax channel constraint on conversations
-- First check if the constraint exists
-- (Note: In Supabase/Postgres, we'll just remove the old check and add a broader one or none)
-- Looking at 001_crm_core.sql, it was: channel TEXT NOT NULL CHECK (channel IN ('WA', 'IG', 'FB', 'EMAIL', 'WEBCHAT'))
-- We'll drop it if it exists by name or regenerate it. 
-- Since names are often generated, we might need a safer approach, but for now we'll assume it's standard.
DO $$ 
BEGIN 
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
END $$;

-- 7. Add Triggers for updated_at
DROP TRIGGER IF EXISTS update_channel_chips_updated_at ON channel_chips;
CREATE TRIGGER update_channel_chips_updated_at BEFORE UPDATE ON channel_chips FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_mini_chips_updated_at ON mini_chips;
CREATE TRIGGER update_mini_chips_updated_at BEFORE UPDATE ON mini_chips FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 8. Seed Default Channel Chips
INSERT INTO channel_chips (channel_id, platform, traffic_source, expected_intent) VALUES 
('whatsapp_main', 'whatsapp', 'direct', 'ventas'),
('instagram_official', 'instagram', 'organic', 'info'),
('facebook_official', 'facebook', 'organic', 'info')
ON CONFLICT (channel_id) DO NOTHING;

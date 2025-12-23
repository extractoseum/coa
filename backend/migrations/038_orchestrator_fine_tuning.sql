-- Migration: Omnichannel Orchestrator Fine-tuning
-- Adds dedicated columns to crm_columns for Phase 3/4 features

ALTER TABLE crm_columns 
ADD COLUMN IF NOT EXISTS assigned_agent_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS objectives TEXT,
ADD COLUMN IF NOT EXISTS voice_profile VARCHAR(50) DEFAULT 'nova';

-- Move existing data if any was stored in config (optional, but good for consistency)
UPDATE crm_columns 
SET assigned_agent_id = config->>'agent_id'
WHERE config->>'agent_id' IS NOT NULL AND assigned_agent_id IS NULL;

-- Migration: Omnichannel CRM Core Schema
-- Created: 2025-12-20
-- Description: Core tables for Kanban CRM, Omnichannel Messaging, Smart Memory, and AI Routing.

-- 1. CRM Columns (Kanban Structure)
CREATE TABLE IF NOT EXISTS crm_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'HUMAN_MODE' CHECK (mode IN ('AI_MODE', 'HUMAN_MODE', 'HYBRID')),
    config JSONB DEFAULT '{}'::jsonb,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL CHECK (channel IN ('WA', 'IG', 'FB', 'EMAIL', 'WEBCHAT')),
    contact_handle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'review', 'archived')),
    column_id UUID REFERENCES crm_columns(id) ON DELETE SET NULL,
    summary TEXT,
    summary_version INTEGER DEFAULT 1,
    last_summarized_at TIMESTAMP WITH TIME ZONE,
    facts JSONB DEFAULT '{}'::jsonb,
    facts_version INTEGER DEFAULT 1,
    agent_override_id TEXT, -- Fallback to column config if NULL
    model_override TEXT,     -- Fallback to column config if NULL
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel, contact_handle)
);

-- 3. Messages (Omnichannel & Audit Log)
CREATE TABLE IF NOT EXISTS crm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('user', 'assistant', 'system')),
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'template', 'event')),
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    external_id TEXT, -- ID from WA/Meta API
    channel_thread_id TEXT, -- ID for social threads
    content TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb, -- Audit log
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tag Events (Historical & Analytics)
CREATE TABLE IF NOT EXISTS tag_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    tag_slug TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'human', 'import', 'system')),
    confidence FLOAT DEFAULT 1.0,
    evidence JSONB DEFAULT '{}'::jsonb, -- Snippet or Message ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Consents (Compliance Ledger)
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_handle TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'revoked', 'pending')),
    source TEXT,
    policy_version INTEGER DEFAULT 1,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contact_handle, channel)
);

-- 6. Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    column_id UUID REFERENCES crm_columns(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('time_window', 'inactivity', 'tag_added', 'message_received')),
    schedule TEXT, -- CRON or RRULE string
    action JSONB NOT NULL, -- { type: 'send_template', template_id: '...' }
    guardrails JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Automation Runs (Execution Log)
CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
    result JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON crm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_column ON conversations(column_id);
CREATE INDEX IF NOT EXISTS idx_conversations_handle ON conversations(contact_handle);
CREATE INDEX IF NOT EXISTS idx_tag_events_conversation ON tag_events(conversation_id);

-- Automatic updated_at Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_crm_columns_updated_at ON crm_columns;
CREATE TRIGGER update_crm_columns_updated_at BEFORE UPDATE ON crm_columns FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_automation_rules_updated_at ON automation_rules;
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Seed Initial Columns
INSERT INTO crm_columns (name, mode, position) VALUES 
('Nuevos', 'AI_MODE', 1),
('Ventas / Ara', 'AI_MODE', 2),
('Seguimiento', 'HYBRID', 3),
('Soporte Humano', 'HUMAN_MODE', 4),
('Finalizados', 'HUMAN_MODE', 5)
ON CONFLICT DO NOTHING;

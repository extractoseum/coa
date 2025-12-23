-- AI Usage Logs Table
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_estimated NUMERIC(10, 6) DEFAULT 0,
    context_type TEXT, -- 'chat', 'embedding', 'voice'
    agent_id TEXT, -- Persona or Agent ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_logs(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at);

-- Browsing Behavior Table (for Customer Insights)
CREATE TABLE IF NOT EXISTS browsing_behavior (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT, -- Contact identifier (normalized)
    page_url TEXT NOT NULL,
    time_on_page INTEGER DEFAULT 0, -- Seconds
    referrer TEXT,
    device_type TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browsing_phone ON browsing_behavior(phone);
CREATE INDEX IF NOT EXISTS idx_browsing_created_at ON browsing_behavior(created_at);

-- 022_system_audit_logs.sql
-- Table to store system-wide logs for debugging and monitoring

CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'webhook', 'fraud', 'notification', 'order', 'client', 'badge', 'system'
    event_type TEXT NOT NULL, -- 'order_create', 'fraud_detected', 'whatsapp_sent', etc.
    severity TEXT DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
    payload JSONB DEFAULT '{}', -- Raw data from Shopify, CVV details, etc.
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL, -- Optional link to client
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_type ON system_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_system_logs_severity ON system_logs(severity);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_client_id ON system_logs(client_id);

-- Metadata for sync tracking (if needed)
INSERT INTO shopify_sync_metadata (sync_type, status)
VALUES ('logs', 'idle')
ON CONFLICT (sync_type) DO NOTHING;

-- Comments
COMMENT ON TABLE system_logs IS 'Central store for system activities, webhooks, and security alerts for monitoring and debugging.';

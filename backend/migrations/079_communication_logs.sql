-- Migration 079: Communication Logs for Smart Communication Service
-- Tracks all communication attempts across channels with fallback results

CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Recipient info
    recipient VARCHAR(255) NOT NULL, -- Phone or email
    client_id UUID REFERENCES clients(id),
    conversation_id UUID REFERENCES conversations(id),

    -- Message details
    message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('instant', 'informational', 'transactional', 'critical')),

    -- Channel tracking
    channels_attempted TEXT[] NOT NULL DEFAULT '{}', -- Array of channels tried
    channel_used VARCHAR(20), -- Which channel succeeded
    success BOOLEAN NOT NULL DEFAULT FALSE,

    -- Detailed results per channel
    channel_results JSONB DEFAULT '{}',
    -- Example: {"whatsapp": {"success": false, "error": "401"}, "email": {"success": true, "messageId": "xyz"}}

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_comm_logs_recipient ON communication_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_comm_logs_client ON communication_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_comm_logs_created ON communication_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_logs_type ON communication_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_comm_logs_success ON communication_logs(success);

-- Channel health tracking table
CREATE TABLE IF NOT EXISTS channel_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel VARCHAR(20) NOT NULL, -- whatsapp, email, sms, push
    token_index INTEGER DEFAULT 0, -- For multiple WhatsApp tokens
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    failure_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_check TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(channel, token_index)
);

-- Function to get communication stats for a client
CREATE OR REPLACE FUNCTION get_client_comm_stats(p_client_id UUID)
RETURNS TABLE (
    total_messages BIGINT,
    successful_messages BIGINT,
    failed_messages BIGINT,
    channels_used JSONB,
    last_communication TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_messages,
        COUNT(*) FILTER (WHERE success)::BIGINT as successful_messages,
        COUNT(*) FILTER (WHERE NOT success)::BIGINT as failed_messages,
        jsonb_object_agg(
            COALESCE(channel_used, 'failed'),
            count_per_channel
        ) as channels_used,
        MAX(created_at) as last_communication
    FROM (
        SELECT
            success,
            channel_used,
            COUNT(*) as count_per_channel,
            MAX(created_at) as created_at
        FROM communication_logs
        WHERE client_id = p_client_id
        GROUP BY success, channel_used
    ) sub;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE communication_logs IS 'Tracks all multi-channel communication attempts with fallback results';
COMMENT ON TABLE channel_health IS 'Real-time health status of communication channels';

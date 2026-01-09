-- Migration: 072_vapi_tool_logs.sql
-- Created: 2025-01-09
-- Description: Detailed logging for VAPI tool calls with learning capabilities
-- Enables error analysis and auto-learning system

-- =============================================
-- VAPI Tool Logs Table
-- Stores detailed info about every tool call for analytics and learning
-- =============================================

CREATE TABLE IF NOT EXISTS vapi_tool_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vapi_call_id VARCHAR(100) NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

    -- Tool Identification
    tool_name VARCHAR(100) NOT NULL,
    tool_call_id VARCHAR(100),           -- VAPI's tool call ID for correlation

    -- Input
    arguments JSONB NOT NULL DEFAULT '{}',
    arguments_raw TEXT,                   -- Original string before parsing

    -- Output
    success BOOLEAN NOT NULL,
    result JSONB,
    result_message TEXT,                  -- Human-readable result message
    error_message TEXT,
    error_stack TEXT,

    -- Timing & Performance
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Context at time of call
    customer_phone VARCHAR(50),
    call_seconds_elapsed NUMERIC(10,3),

    -- Learning & Feedback
    user_feedback VARCHAR(20),            -- 'helpful', 'not_helpful', 'corrected'
    feedback_notes TEXT,
    correction_applied JSONB,             -- What the human corrected it to
    learned_mapping_id UUID,              -- Reference to created mapping

    -- Analysis flags
    needs_review BOOLEAN DEFAULT false,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_tool_logs_call ON vapi_tool_logs(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_conversation ON vapi_tool_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_tool_name ON vapi_tool_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_logs_success ON vapi_tool_logs(success);
CREATE INDEX IF NOT EXISTS idx_tool_logs_created ON vapi_tool_logs(created_at DESC);

-- Composite index for tool performance analysis
CREATE INDEX IF NOT EXISTS idx_tool_logs_tool_success ON vapi_tool_logs(tool_name, success, created_at DESC);

-- Partial index for items needing review
CREATE INDEX IF NOT EXISTS idx_tool_logs_needs_review ON vapi_tool_logs(created_at) WHERE needs_review = true;

-- Partial index for failed calls (for learning)
CREATE INDEX IF NOT EXISTS idx_tool_logs_failed ON vapi_tool_logs(tool_name, created_at) WHERE success = false;

-- Enable RLS
ALTER TABLE vapi_tool_logs ENABLE ROW LEVEL SECURITY;

-- Policy for service role
DROP POLICY IF EXISTS "Service role full access to vapi_tool_logs" ON vapi_tool_logs;
CREATE POLICY "Service role full access to vapi_tool_logs"
    ON vapi_tool_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comments
COMMENT ON TABLE vapi_tool_logs IS 'Detailed logs of VAPI tool calls for analytics and auto-learning';
COMMENT ON COLUMN vapi_tool_logs.user_feedback IS 'Feedback from user/agent: helpful, not_helpful, corrected';
COMMENT ON COLUMN vapi_tool_logs.correction_applied IS 'JSON with correction details when human fixes a wrong result';
COMMENT ON COLUMN vapi_tool_logs.needs_review IS 'Flag for tools that need human review (repeated failures)';

-- =============================================
-- View: Tool Performance Summary
-- =============================================

CREATE OR REPLACE VIEW vapi_tool_performance AS
SELECT
    tool_name,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE success = true) as successful_calls,
    COUNT(*) FILTER (WHERE success = false) as failed_calls,
    ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*), 0), 2) as success_rate,
    ROUND(AVG(duration_ms), 0) as avg_duration_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 0) as p95_duration_ms,
    COUNT(*) FILTER (WHERE needs_review = true) as pending_reviews,
    MAX(created_at) as last_used
FROM vapi_tool_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY tool_name
ORDER BY total_calls DESC;

COMMENT ON VIEW vapi_tool_performance IS 'Aggregated performance metrics for VAPI tools (last 30 days)';

-- =============================================
-- View: Recent Failed Tool Calls (for learning)
-- =============================================

CREATE OR REPLACE VIEW vapi_tool_failures AS
SELECT
    id,
    vapi_call_id,
    tool_name,
    arguments,
    error_message,
    result_message,
    customer_phone,
    needs_review,
    created_at
FROM vapi_tool_logs
WHERE success = false
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW vapi_tool_failures IS 'Recent failed tool calls for analysis and learning';

-- =============================================
-- Function: Auto-flag repeated failures for review
-- =============================================

CREATE OR REPLACE FUNCTION flag_repeated_tool_failures()
RETURNS TRIGGER AS $$
DECLARE
    failure_count INTEGER;
BEGIN
    -- Only check on failures
    IF NEW.success = false THEN
        -- Count recent failures for same tool with similar arguments
        SELECT COUNT(*) INTO failure_count
        FROM vapi_tool_logs
        WHERE tool_name = NEW.tool_name
          AND success = false
          AND created_at > NOW() - INTERVAL '24 hours'
          AND arguments->>'query' = NEW.arguments->>'query';  -- Same search query

        -- Flag for review if 3+ similar failures in 24h
        IF failure_count >= 2 THEN  -- 2 because current one not yet inserted
            NEW.needs_review := true;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-flag repeated failures
DROP TRIGGER IF EXISTS auto_flag_tool_failures ON vapi_tool_logs;
CREATE TRIGGER auto_flag_tool_failures
    BEFORE INSERT ON vapi_tool_logs
    FOR EACH ROW
    EXECUTE FUNCTION flag_repeated_tool_failures();

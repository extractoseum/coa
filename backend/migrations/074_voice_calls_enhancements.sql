-- Migration: 074_voice_calls_enhancements.sql
-- Created: 2025-01-09
-- Description: Add new fields to voice_calls for smart sync and analytics

-- =============================================
-- New Fields for voice_calls
-- =============================================

-- Live transcript flag
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    live_transcript_enabled BOOLEAN DEFAULT true;

-- Tool usage counters
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    tool_calls_count INTEGER DEFAULT 0;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    tool_errors_count INTEGER DEFAULT 0;

-- Sentiment analysis
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    user_sentiment VARCHAR(20);  -- 'positive', 'neutral', 'negative', 'frustrated'

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    sentiment_score NUMERIC(3,2);  -- -1.00 to 1.00

-- Human intervention tracking
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    intervention_count INTEGER DEFAULT 0;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    escalated BOOLEAN DEFAULT false;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    escalation_reason TEXT;

-- Call quality metrics
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    total_speaking_time_seconds INTEGER;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    user_speaking_time_seconds INTEGER;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    assistant_speaking_time_seconds INTEGER;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    silence_time_seconds INTEGER;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    interruption_count INTEGER DEFAULT 0;

-- VAPI metadata
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    assistant_id VARCHAR(100);

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    phone_number_id VARCHAR(100);

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    cost NUMERIC(10,4);

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    messages_json JSONB;  -- Full conversation history

-- Context injection tracking
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    context_injected BOOLEAN DEFAULT false;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
    context_data JSONB;  -- What context was injected

-- =============================================
-- Indexes for new fields
-- =============================================

CREATE INDEX IF NOT EXISTS idx_voice_calls_sentiment ON voice_calls(user_sentiment);
CREATE INDEX IF NOT EXISTS idx_voice_calls_escalated ON voice_calls(escalated) WHERE escalated = true;
CREATE INDEX IF NOT EXISTS idx_voice_calls_created ON voice_calls(created_at DESC);

-- =============================================
-- Comments
-- =============================================

COMMENT ON COLUMN voice_calls.live_transcript_enabled IS 'Whether this call had live transcript streaming';
COMMENT ON COLUMN voice_calls.tool_calls_count IS 'Number of tool calls made during this call';
COMMENT ON COLUMN voice_calls.tool_errors_count IS 'Number of tool calls that failed';
COMMENT ON COLUMN voice_calls.user_sentiment IS 'Overall sentiment: positive, neutral, negative, frustrated';
COMMENT ON COLUMN voice_calls.intervention_count IS 'Number of times a human intervened during call';
COMMENT ON COLUMN voice_calls.escalated IS 'Whether call was escalated to human';
COMMENT ON COLUMN voice_calls.context_injected IS 'Whether CRM context was injected into call';

-- =============================================
-- View: Call Analytics Summary
-- =============================================

CREATE OR REPLACE VIEW voice_call_analytics AS
SELECT
    DATE(created_at) as call_date,
    direction,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'ended' AND ended_reason = 'assistant-ended-call') as completed_calls,
    COUNT(*) FILTER (WHERE status = 'ended' AND ended_reason = 'silence-timed-out') as timeout_calls,
    COUNT(*) FILTER (WHERE escalated = true) as escalated_calls,
    ROUND(AVG(duration_seconds), 0) as avg_duration_seconds,
    ROUND(AVG(tool_calls_count), 1) as avg_tools_used,
    ROUND(AVG(tool_errors_count), 1) as avg_tool_errors,
    ROUND(SUM(cost), 2) as total_cost,
    COUNT(*) FILTER (WHERE user_sentiment = 'positive') as positive_sentiment,
    COUNT(*) FILTER (WHERE user_sentiment = 'negative' OR user_sentiment = 'frustrated') as negative_sentiment
FROM voice_calls
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), direction
ORDER BY call_date DESC, direction;

COMMENT ON VIEW voice_call_analytics IS 'Daily aggregated voice call metrics';

-- =============================================
-- Function: Update call metrics after tool log
-- =============================================

CREATE OR REPLACE FUNCTION update_voice_call_tool_counts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE voice_calls
    SET
        tool_calls_count = COALESCE(tool_calls_count, 0) + 1,
        tool_errors_count = CASE
            WHEN NEW.success = false THEN COALESCE(tool_errors_count, 0) + 1
            ELSE tool_errors_count
        END
    WHERE vapi_call_id = NEW.vapi_call_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update counts
DROP TRIGGER IF EXISTS update_call_tool_counts ON vapi_tool_logs;
CREATE TRIGGER update_call_tool_counts
    AFTER INSERT ON vapi_tool_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_voice_call_tool_counts();

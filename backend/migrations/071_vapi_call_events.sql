-- Migration: 071_vapi_call_events.sql
-- Created: 2025-01-09
-- Description: Real-time event logging for VAPI voice calls
-- Enables live transcript sync and call analytics

-- =============================================
-- VAPI Call Events Table
-- Stores every event from a voice call for real-time sync and analytics
-- =============================================

CREATE TABLE IF NOT EXISTS vapi_call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vapi_call_id VARCHAR(100) NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

    -- Event Classification
    event_type VARCHAR(50) NOT NULL,  -- 'transcript', 'status-update', 'tool-call', 'tool-result', 'user-interrupted', 'hang', 'error'
    event_subtype VARCHAR(50),         -- For transcripts: 'partial', 'final'. For status: 'queued', 'ringing', 'in-progress', 'ended'

    -- Event Data (full payload for debugging)
    event_data JSONB NOT NULL DEFAULT '{}',

    -- Transcript-specific fields (denormalized for fast queries)
    speaker VARCHAR(20),               -- 'assistant', 'user', 'system'
    transcript_text TEXT,
    is_final BOOLEAN DEFAULT false,

    -- Tool-specific fields (denormalized)
    tool_name VARCHAR(100),
    tool_call_id VARCHAR(100),

    -- Timing
    event_time TIMESTAMPTZ DEFAULT NOW(),
    seconds_from_start NUMERIC(10,3),

    -- Processing metadata
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vapi_events_call_id ON vapi_call_events(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_vapi_events_conversation ON vapi_call_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_vapi_events_type ON vapi_call_events(event_type);
CREATE INDEX IF NOT EXISTS idx_vapi_events_time ON vapi_call_events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_vapi_events_call_time ON vapi_call_events(vapi_call_id, event_time);

-- Partial index for unprocessed events (for async processing)
CREATE INDEX IF NOT EXISTS idx_vapi_events_unprocessed ON vapi_call_events(created_at) WHERE processed = false;

-- Enable RLS
ALTER TABLE vapi_call_events ENABLE ROW LEVEL SECURITY;

-- Policy for service role (backend)
CREATE POLICY "Service role full access to vapi_call_events"
    ON vapi_call_events
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comments
COMMENT ON TABLE vapi_call_events IS 'Real-time event log for VAPI voice calls - enables live transcript sync';
COMMENT ON COLUMN vapi_call_events.event_type IS 'Event type: transcript, status-update, tool-call, tool-result, user-interrupted, hang, error';
COMMENT ON COLUMN vapi_call_events.speaker IS 'For transcripts: assistant, user, or system';
COMMENT ON COLUMN vapi_call_events.seconds_from_start IS 'Seconds elapsed since call started';

-- =============================================
-- Function to notify on new events (for Supabase Realtime)
-- =============================================

CREATE OR REPLACE FUNCTION notify_vapi_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify channel with call_id for filtering
    PERFORM pg_notify(
        'vapi_call_events',
        json_build_object(
            'id', NEW.id,
            'vapi_call_id', NEW.vapi_call_id,
            'conversation_id', NEW.conversation_id,
            'event_type', NEW.event_type,
            'speaker', NEW.speaker,
            'transcript_text', LEFT(NEW.transcript_text, 500),
            'is_final', NEW.is_final,
            'tool_name', NEW.tool_name,
            'seconds_from_start', NEW.seconds_from_start
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for realtime notifications
DROP TRIGGER IF EXISTS vapi_event_notify ON vapi_call_events;
CREATE TRIGGER vapi_event_notify
    AFTER INSERT ON vapi_call_events
    FOR EACH ROW
    EXECUTE FUNCTION notify_vapi_event();

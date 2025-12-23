-- Migration: 043_vapi_integration.sql

-- Store Vapi assistant configurations per column
ALTER TABLE crm_columns ADD COLUMN IF NOT EXISTS
  vapi_assistant_id VARCHAR(100);

-- Track voice calls
CREATE TABLE IF NOT EXISTS voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id VARCHAR(100) UNIQUE NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  client_id UUID REFERENCES clients(id),

  -- Call Metadata
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  phone_number VARCHAR(20),
  status VARCHAR(20),

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,

  -- Content
  transcript TEXT,
  summary TEXT,
  recording_url TEXT,

  -- Analysis (from Vapi)
  ended_reason VARCHAR(50),
  sentiment VARCHAR(20),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_voice_calls_conversation ON voice_calls(conversation_id);
CREATE INDEX idx_voice_calls_vapi_id ON voice_calls(vapi_call_id);

-- Migration: 042_voice_interactions
-- Description: Create table for storing voice interaction logs and analytics
-- Author: System Debugger (Mission K)
-- Date: 2025-12-22

CREATE TABLE IF NOT EXISTS voice_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(100) NOT NULL,
    client_id UUID REFERENCES clients(id),
    conversation_id UUID REFERENCES conversations(id),
    
    -- Audio Metadata
    audio_url TEXT,
    channel VARCHAR(20),
    
    -- Analysis
    transcript TEXT,
    transcript_confidence DECIMAL(4,3),
    language VARCHAR(10),
    summary TEXT,
    
    -- Intelligence
    intent VARCHAR(50),
    intent_confidence DECIMAL(4,3),
    emotion_text_primary VARCHAR(50),
    emotion_text_score DECIMAL(4,3),
    sentiment_score DECIMAL(4,3),
    
    -- Risk & Action
    risk_flags_combined TEXT[],
    predicted_action VARCHAR(50),
    escalated BOOLEAN DEFAULT false,
    escalation_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by conversation or client
CREATE INDEX idx_voice_interactions_conversation ON voice_interactions(conversation_id);
CREATE INDEX idx_voice_interactions_client ON voice_interactions(client_id);

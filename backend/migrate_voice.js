
const { Client } = require('pg');

// Hardcoded connection string from .env I read earlier - Direct Port 5432
const connectionString = 'postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:5432/postgres';

const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS voice_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(64) NOT NULL,
    client_id UUID, 
    conversation_id UUID,

    -- Audio
    audio_url TEXT NOT NULL,
    audio_duration_seconds DECIMAL(10,2),
    channel VARCHAR(20) NOT NULL,

    -- Transcription
    transcript TEXT,
    transcript_confidence DECIMAL(3,2),
    language VARCHAR(10),

    -- Analysis
    summary TEXT,
    intent VARCHAR(50),
    intent_confidence DECIMAL(3,2),

    -- Emotion / Sentiment
    emotion_text_primary VARCHAR(30),
    emotion_text_score DECIMAL(3,2),
    emotion_audio_energy DECIMAL(5,2),
    emotion_audio_pitch_variance DECIMAL(5,2),
    emotion_audio_speaking_rate DECIMAL(5,2),
    emotion_fusion_primary VARCHAR(30),
    emotion_fusion_score DECIMAL(3,2),
    sentiment_score DECIMAL(3,2),

    -- Audit
    evidence_quotes JSONB,
    confidence_reason TEXT,

    -- Risk
    risk_flags_deterministic TEXT[],
    risk_flags_llm TEXT[],
    risk_flags_combined TEXT[],

    -- Action
    predicted_action VARCHAR(50),
    action_taken VARCHAR(50),
    escalated BOOLEAN DEFAULT FALSE,
    escalation_reason TEXT,

    -- Response
    response_text TEXT,
    response_audio_url TEXT,
    response_latency_ms INTEGER,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    CONSTRAINT voice_interactions_trace_id_idx UNIQUE (trace_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_client ON voice_interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_voice_conversation ON voice_interactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_created ON voice_interactions(created_at DESC);
`;

async function migrate() {
    try {
        console.log('Connecting to database...');
        await client.connect();

        console.log('Executing voice_interactions migration...');
        const res = await client.query(CREATE_TABLE_SQL);

        console.log('Migration successful:', res);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();

-- Migration 077: Add recording columns to voice_calls
-- Stores Twilio recording URL and metadata

-- Add recording columns to voice_calls if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_calls' AND column_name = 'recording_url'
    ) THEN
        ALTER TABLE voice_calls ADD COLUMN recording_url TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_calls' AND column_name = 'recording_sid'
    ) THEN
        ALTER TABLE voice_calls ADD COLUMN recording_sid TEXT;
    END IF;
END $$;

-- Create index for calls with recordings
CREATE INDEX IF NOT EXISTS idx_voice_calls_recording
ON voice_calls(recording_url)
WHERE recording_url IS NOT NULL;

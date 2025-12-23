-- Migration: Voice Profile Hardening (Fix 42804)
-- Converts voice_profile from VARCHAR to JSONB for rich configuration
-- Created: 2025-12-22

-- 1. DROP EXISTING DEFAULT to prevent cast error (42804)
ALTER TABLE crm_columns 
  ALTER COLUMN voice_profile DROP DEFAULT;

-- 2. Alter column type with USING clause to handle existing data
-- We map 'nova' or any string to a basic OpenAI config structure
ALTER TABLE crm_columns 
  ALTER COLUMN voice_profile TYPE JSONB 
  USING jsonb_build_object(
    'provider', 'openai',
    'voice_id', COALESCE(voice_profile, 'nova'),
    'settings', '{}'::jsonb
  );

-- 3. Set NEW default value
ALTER TABLE crm_columns 
  ALTER COLUMN voice_profile 
  SET DEFAULT '{"provider": "openai", "voice_id": "nova", "settings": {}}'::jsonb;

-- 4. Add comment for clarity
COMMENT ON COLUMN crm_columns.voice_profile IS 'JSON Config: { provider: "elevenlabs"|"openai", voice_id: string, settings: object }';

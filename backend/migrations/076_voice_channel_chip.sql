-- Migration 076: Add Voice Channel Chip for Omnichannel Integration
-- This creates the Voice chip that routes incoming calls to the CRM

-- Insert Voice Channel Chip
INSERT INTO channel_chips (
    id,
    channel_id,
    platform,
    account_reference,
    traffic_source,
    expected_intent,
    default_entry_column_id,
    default_agent_id,
    ruleset,
    is_active,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'voice_twilio_main',
    'voice',
    '5596616455',  -- Twilio phone number (last 10 digits)
    'direct',
    'ventas',
    'da57192a-7a32-4e8d-a8ff-6cce77e8300c',  -- "Ventas / Ara" column
    'sales_ara',
    '{}',
    true,
    NOW(),
    NOW()
) ON CONFLICT (channel_id) DO UPDATE SET
    platform = EXCLUDED.platform,
    account_reference = EXCLUDED.account_reference,
    default_entry_column_id = EXCLUDED.default_entry_column_id,
    default_agent_id = EXCLUDED.default_agent_id,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Add index for voice platform lookups
CREATE INDEX IF NOT EXISTS idx_channel_chips_voice
ON channel_chips(platform, account_reference)
WHERE platform = 'voice' AND is_active = true;

-- Add channel_chip_id column to voice_calls if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_calls' AND column_name = 'channel_chip_id'
    ) THEN
        ALTER TABLE voice_calls ADD COLUMN channel_chip_id UUID REFERENCES channel_chips(id);
    END IF;
END $$;

-- Create index for voice_calls by chip
CREATE INDEX IF NOT EXISTS idx_voice_calls_chip
ON voice_calls(channel_chip_id)
WHERE channel_chip_id IS NOT NULL;

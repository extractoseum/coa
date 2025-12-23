-- Migration: Chip System Hardening
-- Addresses: defaults, backfill, indexes, nullability
-- Created: 2025-12-22

-- 1. Ensure is_active has explicit default (safety)
ALTER TABLE mini_chips 
  ALTER COLUMN is_active SET DEFAULT true;

-- 2. Backfill name for existing rows if null
UPDATE mini_chips 
SET name = CONCAT(chip_type, '_', key) 
WHERE name IS NULL;

-- 3. Add NOT NULL constraint on name (after backfill)
-- We use a sub-transaction block or just simple ALTER if non-empty
ALTER TABLE mini_chips 
  ALTER COLUMN name SET NOT NULL;

-- 4. Performance indexes for ChipEngine queries
CREATE INDEX IF NOT EXISTS idx_mini_chips_active_priority 
  ON mini_chips(is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_mini_chips_channel_active 
  ON mini_chips(channel_chip_id) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_conversation_chips_conversation 
  ON conversation_chips(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_chips_minichip 
  ON conversation_chips(mini_chip_id);

-- 5. Add index for ChannelRouter lookups
CREATE INDEX IF NOT EXISTS idx_channel_chips_platform_active 
  ON channel_chips(platform, is_active);

CREATE INDEX IF NOT EXISTS idx_channel_chips_account_ref 
  ON channel_chips(account_reference) 
  WHERE is_active = true;

-- 6. Add triggered_by_message_id index for conversation_chips
CREATE INDEX IF NOT EXISTS idx_conversation_chips_triggered_msg
  ON conversation_chips(triggered_by_message_id)
  WHERE triggered_by_message_id IS NOT NULL;

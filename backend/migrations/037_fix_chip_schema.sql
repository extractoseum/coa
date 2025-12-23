-- Fix mini_chips schema to match chipEngine.ts
ALTER TABLE mini_chips 
  RENAME COLUMN active TO is_active;

ALTER TABLE mini_chips 
  RENAME COLUMN actions TO actions_payload;

ALTER TABLE mini_chips 
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

ALTER TABLE mini_chips 
  ADD COLUMN IF NOT EXISTS name VARCHAR(100);

ALTER TABLE mini_chips 
  ADD COLUMN IF NOT EXISTS channel_chip_id UUID REFERENCES channel_chips(id) ON DELETE SET NULL;

-- Fix conversation_chips schema
ALTER TABLE conversation_chips 
  RENAME COLUMN chip_id TO mini_chip_id;

ALTER TABLE conversation_chips 
  ADD COLUMN IF NOT EXISTS triggered_by_message_id UUID REFERENCES crm_messages(id) ON DELETE SET NULL;

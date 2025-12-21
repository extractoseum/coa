
ALTER TABLE crm_contact_snapshots ADD COLUMN IF NOT EXISTS action_plan JSONB DEFAULT '[]'::JSONB;

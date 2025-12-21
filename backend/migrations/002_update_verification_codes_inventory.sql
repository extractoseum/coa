-- Migration: Update verification_codes for inventory system
-- Add assigned_at column for tracking when CVVs are assigned to COAs

-- Add new column if it doesn't exist
ALTER TABLE public.verification_codes 
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- Make coa_id nullable (allowing unassigned CVVs)
-- Note: If table already exists, this might need to be done via ALTER TABLE
-- For new installations, the CREATE TABLE in schema.sql already has it nullable

-- Update comment
COMMENT ON COLUMN public.verification_codes.coa_id IS 'NULL = unassigned/inventory hologram';
COMMENT ON COLUMN public.verification_codes.assigned_at IS 'When CVV was assigned to a COA';

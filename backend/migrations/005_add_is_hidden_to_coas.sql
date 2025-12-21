-- Migration: Add is_hidden to COAs table
-- Allows clients to hide specific COAs from public folder views
-- Run this in Supabase SQL Editor

-- Add is_hidden column to coas table
ALTER TABLE public.coas
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_coas_is_hidden ON public.coas(is_hidden);

-- Comment explaining the field
COMMENT ON COLUMN public.coas.is_hidden IS 'When true, COA is hidden from public folder views but visible in client dashboard';

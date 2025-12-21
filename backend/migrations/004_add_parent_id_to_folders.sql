-- Migration: Add parent_id to folders table for hierarchical folder structure
-- Run this in Supabase SQL Editor

-- Add parent_id column to folders table
ALTER TABLE public.folders
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE;

-- Create index for faster parent lookups
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_id);

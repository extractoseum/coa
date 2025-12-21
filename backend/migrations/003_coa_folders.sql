-- Migration: COA Folders System
-- Run this in Supabase SQL Editor

-- Create coa_folders table (for organizing COAs hierarchically)
CREATE TABLE IF NOT EXISTS public.coa_folders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.coa_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    public_token TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
    is_public BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coa_folders_client ON public.coa_folders(client_id);
CREATE INDEX IF NOT EXISTS idx_coa_folders_parent ON public.coa_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_coa_folders_token ON public.coa_folders(public_token);

-- Create coa_folder_items table (relation between folders and COAs)
CREATE TABLE IF NOT EXISTS public.coa_folder_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    folder_id UUID NOT NULL REFERENCES public.coa_folders(id) ON DELETE CASCADE,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sort_order INTEGER DEFAULT 0,
    UNIQUE(folder_id, coa_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coa_folder_items_folder ON public.coa_folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_coa_folder_items_coa ON public.coa_folder_items(coa_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.coa_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coa_folder_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coa_folders
-- Allow clients to see their own folders
CREATE POLICY "Clients can view own folders" ON public.coa_folders
    FOR SELECT USING (true);

-- Allow clients to insert their own folders
CREATE POLICY "Clients can insert own folders" ON public.coa_folders
    FOR INSERT WITH CHECK (true);

-- Allow clients to update their own folders
CREATE POLICY "Clients can update own folders" ON public.coa_folders
    FOR UPDATE USING (true);

-- Allow clients to delete their own folders
CREATE POLICY "Clients can delete own folders" ON public.coa_folders
    FOR DELETE USING (true);

-- RLS Policies for coa_folder_items
CREATE POLICY "Allow all folder items" ON public.coa_folder_items
    FOR ALL USING (true);

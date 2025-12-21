-- Migration: Folders System for COA Organization
-- Run this SQL in your Supabase SQL Editor

-- 1. Folders Table (for organizing COAs)
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#10b981',  -- Emerald color by default
    icon TEXT DEFAULT 'folder',    -- Icon name (lucide icons)
    public_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),  -- For QR sharing
    is_public BOOLEAN DEFAULT FALSE,  -- If true, QR code works without auth
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_folders_client ON public.folders(client_id);
CREATE INDEX IF NOT EXISTS idx_folders_public_token ON public.folders(public_token);

-- 2. Folder-COA relationship (many-to-many, a COA can be in multiple folders)
CREATE TABLE IF NOT EXISTS public.folder_coas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(folder_id, coa_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_coas_folder ON public.folder_coas(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_coas_coa ON public.folder_coas(coa_id);

-- 3. Enable RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_coas ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Service role full access to folders" ON public.folders
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to folder_coas" ON public.folder_coas
    FOR ALL USING (true) WITH CHECK (true);

-- 5. Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_folder_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_folders_updated_at ON public.folders;
CREATE TRIGGER trigger_folders_updated_at
    BEFORE UPDATE ON public.folders
    FOR EACH ROW
    EXECUTE FUNCTION update_folder_updated_at();

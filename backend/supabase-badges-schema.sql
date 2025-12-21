-- Schema for Badge Management System
-- Run this in your Supabase SQL Editor to create the badge tables

-- 1. Create badges table
CREATE TABLE IF NOT EXISTS public.badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create coa_badges junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.coa_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coa_id, badge_id) -- Prevent duplicate badge assignments
);

-- 3. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_coa_badges_coa_id ON public.coa_badges(coa_id);
CREATE INDEX IF NOT EXISTS idx_coa_badges_badge_id ON public.coa_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_badges_name ON public.badges(name);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coa_badges ENABLE ROW LEVEL SECURITY;

-- 5. Create policies for public read access
CREATE POLICY "Badges are viewable by everyone"
    ON public.badges FOR SELECT
    USING (true);

CREATE POLICY "COA badges are viewable by everyone"
    ON public.coa_badges FOR SELECT
    USING (true);

-- 6. Create policies for service role (backend) full access
CREATE POLICY "Service role can insert badges"
    ON public.badges FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update badges"
    ON public.badges FOR UPDATE
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete badges"
    ON public.badges FOR DELETE
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can insert coa_badges"
    ON public.coa_badges FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can delete coa_badges"
    ON public.coa_badges FOR DELETE
    USING (auth.role() = 'service_role');

-- 7. Create updated_at trigger for badges table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_badges_updated_at
    BEFORE UPDATE ON public.badges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Create storage bucket for badge images (if not exists)
-- Note: This needs to be run separately in Supabase Storage interface
-- or you can create it programmatically via the Supabase client
-- Bucket name: 'badges'
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/png, image/svg+xml

COMMENT ON TABLE public.badges IS 'Stores badge/certification metadata and images';
COMMENT ON TABLE public.coa_badges IS 'Junction table linking COAs to their assigned badges';

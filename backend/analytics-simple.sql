-- Analytics Schema (Simplified)
-- Copy this entire content to Supabase SQL Editor and Run

-- 1. COA Scans Table
DROP TABLE IF EXISTS public.coa_scans CASCADE;

CREATE TABLE public.coa_scans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    access_type TEXT NOT NULL CHECK (access_type IN (
        'direct_link', 'qr_global', 'cvv_verification', 'pdf_link', 'internal_nav'
    )),
    link_source TEXT CHECK (link_source IN (
        'batch_id', 'token', 'product_image', 'coa_number', 'qr_code', 'purchase_link', 'other'
    )),
    verification_code_id UUID,
    cvv_code_used TEXT,
    session_id TEXT,
    is_unique_visit BOOLEAN DEFAULT TRUE,
    ip_address TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    referrer TEXT,
    device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
    browser TEXT,
    os TEXT,
    country TEXT,
    country_code TEXT,
    region TEXT,
    city TEXT,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT
);

CREATE INDEX idx_coa_scans_coa_id ON public.coa_scans(coa_id);
CREATE INDEX idx_coa_scans_scanned_at ON public.coa_scans(scanned_at);

-- 2. PDF Downloads Table
DROP TABLE IF EXISTS public.pdf_downloads CASCADE;

CREATE TABLE public.pdf_downloads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    pdf_type TEXT NOT NULL CHECK (pdf_type IN ('original', 'branded', 'custom')),
    ip_address TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    device_type TEXT,
    country TEXT,
    country_code TEXT,
    city TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pdf_downloads_coa ON public.pdf_downloads(coa_id);

-- 3. Link Clicks Table
DROP TABLE IF EXISTS public.link_clicks CASCADE;

CREATE TABLE public.link_clicks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('purchase', 'website', 'social', 'document', 'external')),
    link_url TEXT NOT NULL,
    link_label TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    device_type TEXT,
    country_code TEXT,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_link_clicks_coa ON public.link_clicks(coa_id);

-- 4. Enable RLS but allow all access via service role
ALTER TABLE public.coa_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for coa_scans" ON public.coa_scans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pdf_downloads" ON public.pdf_downloads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for link_clicks" ON public.link_clicks FOR ALL USING (true) WITH CHECK (true);

-- Done! Analytics tables created.

-- Migration: COA Analytics System
-- Provides detailed tracking of COA access for owners (clients) and super admins
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- 1. Enhanced COA Access Tracking Table
-- ============================================
-- Drop old basic scans table if exists and recreate with full tracking
DROP TABLE IF EXISTS public.coa_scans CASCADE;

CREATE TABLE public.coa_scans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,

    -- Access method tracking
    access_type TEXT NOT NULL CHECK (access_type IN (
        'direct_link',      -- Acceso via link directo (compartido)
        'qr_global',        -- Acceso via QR code global del COA
        'cvv_verification', -- Acceso via codigo de verificacion (CVV)
        'pdf_link',         -- Click en link dentro del PDF
        'internal_nav'      -- Navegacion interna desde otro COA/pagina
    )),

    -- For pdf_link access, which element was clicked
    link_source TEXT CHECK (link_source IN (
        'batch_id',         -- Click en el batch/lote
        'token',            -- Click en el token publico
        'product_image',    -- Click en imagen del producto
        'coa_number',       -- Click en numero de COA
        'qr_code',          -- Escaneo del QR en el PDF
        'purchase_link',    -- Click en link de compra
        'other'             -- Otros links
    )),

    -- CVV tracking (if access_type = 'cvv_verification')
    verification_code_id UUID REFERENCES public.verification_codes(id),
    cvv_code_used TEXT, -- Store the actual code used for reference

    -- Session tracking
    session_id TEXT, -- Unique session identifier for grouping pageviews
    is_unique_visit BOOLEAN DEFAULT TRUE, -- First visit from this session

    -- Visitor information
    ip_address TEXT,
    ip_hash TEXT, -- Hashed IP for privacy-compliant unique counting
    user_agent TEXT,
    referrer TEXT,

    -- Parsed user agent info
    device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
    browser TEXT,
    os TEXT,

    -- Geo-location data
    country TEXT,
    country_code TEXT,
    region TEXT,
    city TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone TEXT,
    geo_data JSONB, -- Full geo response for detailed analysis

    -- Timestamps
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- UTM tracking for marketing
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT
);

-- Indexes for fast queries
CREATE INDEX idx_coa_scans_coa_id ON public.coa_scans(coa_id);
CREATE INDEX idx_coa_scans_access_type ON public.coa_scans(access_type);
CREATE INDEX idx_coa_scans_scanned_at ON public.coa_scans(scanned_at);
CREATE INDEX idx_coa_scans_ip_hash ON public.coa_scans(ip_hash);
CREATE INDEX idx_coa_scans_session ON public.coa_scans(session_id);
CREATE INDEX idx_coa_scans_country ON public.coa_scans(country_code);
CREATE INDEX idx_coa_scans_device ON public.coa_scans(device_type);

-- ============================================
-- 2. Daily Analytics Aggregation Table
-- ============================================
-- Pre-aggregated daily stats for fast dashboard loading
CREATE TABLE public.coa_analytics_daily (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Total counts
    total_views INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,

    -- By access type
    views_direct_link INTEGER DEFAULT 0,
    views_qr_global INTEGER DEFAULT 0,
    views_cvv INTEGER DEFAULT 0,
    views_pdf_link INTEGER DEFAULT 0,

    -- By PDF link source
    clicks_batch_id INTEGER DEFAULT 0,
    clicks_token INTEGER DEFAULT 0,
    clicks_product_image INTEGER DEFAULT 0,
    clicks_coa_number INTEGER DEFAULT 0,
    clicks_qr_code INTEGER DEFAULT 0,
    clicks_purchase_link INTEGER DEFAULT 0,

    -- By device type
    views_desktop INTEGER DEFAULT 0,
    views_mobile INTEGER DEFAULT 0,
    views_tablet INTEGER DEFAULT 0,

    -- Top countries (JSON array of {country, count})
    top_countries JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(coa_id, date)
);

CREATE INDEX idx_analytics_daily_coa ON public.coa_analytics_daily(coa_id);
CREATE INDEX idx_analytics_daily_date ON public.coa_analytics_daily(date);

-- ============================================
-- 3. Client Analytics Summary Table
-- ============================================
-- Aggregated stats per client (COA owner) for quick dashboard
CREATE TABLE public.client_analytics_summary (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

    -- Lifetime totals
    total_coas INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_unique_visitors INTEGER DEFAULT 0,
    total_cvv_verifications INTEGER DEFAULT 0,
    total_qr_scans INTEGER DEFAULT 0,

    -- Last 30 days
    views_last_30_days INTEGER DEFAULT 0,
    unique_visitors_last_30_days INTEGER DEFAULT 0,

    -- Last 7 days
    views_last_7_days INTEGER DEFAULT 0,
    unique_visitors_last_7_days INTEGER DEFAULT 0,

    -- Most viewed COA
    most_viewed_coa_id UUID REFERENCES public.coas(id),
    most_viewed_coa_views INTEGER DEFAULT 0,

    -- Top countries (JSON)
    top_countries JSONB DEFAULT '[]'::jsonb,

    -- Top devices
    device_breakdown JSONB DEFAULT '{}'::jsonb, -- {desktop: 40, mobile: 55, tablet: 5}

    last_activity_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(client_id)
);

CREATE INDEX idx_client_analytics_client ON public.client_analytics_summary(client_id);

-- ============================================
-- 4. PDF Download Tracking
-- ============================================
CREATE TABLE public.pdf_downloads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,

    pdf_type TEXT NOT NULL CHECK (pdf_type IN ('original', 'branded', 'custom')),

    -- Requester info
    ip_address TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    device_type TEXT,

    -- Location
    country TEXT,
    country_code TEXT,
    city TEXT,

    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pdf_downloads_coa ON public.pdf_downloads(coa_id);
CREATE INDEX idx_pdf_downloads_date ON public.pdf_downloads(downloaded_at);

-- ============================================
-- 5. Link Click Tracking (for purchase links, etc.)
-- ============================================
CREATE TABLE public.link_clicks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,

    link_type TEXT NOT NULL CHECK (link_type IN (
        'purchase',         -- Link de compra
        'website',          -- Link al sitio web
        'social',           -- Redes sociales
        'document',         -- Documentos adicionales
        'external'          -- Otros links externos
    )),
    link_url TEXT NOT NULL,
    link_label TEXT, -- "Comprar en Amazon", etc.

    -- Visitor info
    ip_hash TEXT,
    user_agent TEXT,
    device_type TEXT,
    country_code TEXT,

    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_link_clicks_coa ON public.link_clicks(coa_id);
CREATE INDEX idx_link_clicks_type ON public.link_clicks(link_type);

-- ============================================
-- 6. Suspicious Activity Log
-- ============================================
-- Track potentially fraudulent scan patterns
CREATE TABLE public.suspicious_activity (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID REFERENCES public.coas(id) ON DELETE SET NULL,
    verification_code_id UUID REFERENCES public.verification_codes(id) ON DELETE SET NULL,

    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'high_scan_rate',       -- Muchos escaneos en poco tiempo
        'geographic_anomaly',   -- Escaneos de ubicaciones muy distantes
        'bot_detected',         -- User agent parece bot
        'multiple_cvv_attempts',-- Multiples intentos de CVV fallidos
        'revoked_cvv_scan',     -- Intento de usar CVV revocado
        'suspicious_pattern'    -- Patron general sospechoso
    )),

    severity TEXT DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    details JSONB, -- Detalles especificos de la actividad

    ip_address TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    country_code TEXT,

    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES public.clients(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,

    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_suspicious_coa ON public.suspicious_activity(coa_id);
CREATE INDEX idx_suspicious_type ON public.suspicious_activity(activity_type);
CREATE INDEX idx_suspicious_severity ON public.suspicious_activity(severity);
CREATE INDEX idx_suspicious_unresolved ON public.suspicious_activity(is_resolved) WHERE is_resolved = FALSE;

-- ============================================
-- 7. RLS Policies
-- ============================================
ALTER TABLE public.coa_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coa_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_analytics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspicious_activity ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to coa_scans" ON public.coa_scans
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to coa_analytics_daily" ON public.coa_analytics_daily
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to client_analytics_summary" ON public.client_analytics_summary
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to pdf_downloads" ON public.pdf_downloads
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to link_clicks" ON public.link_clicks
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to suspicious_activity" ON public.suspicious_activity
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 8. Helper Functions
-- ============================================

-- Function to hash IP addresses for privacy
CREATE OR REPLACE FUNCTION hash_ip(ip TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(sha256(ip::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update daily analytics
CREATE OR REPLACE FUNCTION update_daily_analytics()
RETURNS TRIGGER AS $$
DECLARE
    scan_date DATE;
BEGIN
    scan_date := DATE(NEW.scanned_at);

    -- Insert or update daily aggregation
    INSERT INTO public.coa_analytics_daily (coa_id, date, total_views, unique_visitors)
    VALUES (NEW.coa_id, scan_date, 1, CASE WHEN NEW.is_unique_visit THEN 1 ELSE 0 END)
    ON CONFLICT (coa_id, date) DO UPDATE SET
        total_views = coa_analytics_daily.total_views + 1,
        unique_visitors = coa_analytics_daily.unique_visitors +
            CASE WHEN NEW.is_unique_visit THEN 1 ELSE 0 END,
        views_direct_link = coa_analytics_daily.views_direct_link +
            CASE WHEN NEW.access_type = 'direct_link' THEN 1 ELSE 0 END,
        views_qr_global = coa_analytics_daily.views_qr_global +
            CASE WHEN NEW.access_type = 'qr_global' THEN 1 ELSE 0 END,
        views_cvv = coa_analytics_daily.views_cvv +
            CASE WHEN NEW.access_type = 'cvv_verification' THEN 1 ELSE 0 END,
        views_pdf_link = coa_analytics_daily.views_pdf_link +
            CASE WHEN NEW.access_type = 'pdf_link' THEN 1 ELSE 0 END,
        clicks_batch_id = coa_analytics_daily.clicks_batch_id +
            CASE WHEN NEW.link_source = 'batch_id' THEN 1 ELSE 0 END,
        clicks_token = coa_analytics_daily.clicks_token +
            CASE WHEN NEW.link_source = 'token' THEN 1 ELSE 0 END,
        clicks_product_image = coa_analytics_daily.clicks_product_image +
            CASE WHEN NEW.link_source = 'product_image' THEN 1 ELSE 0 END,
        clicks_coa_number = coa_analytics_daily.clicks_coa_number +
            CASE WHEN NEW.link_source = 'coa_number' THEN 1 ELSE 0 END,
        clicks_qr_code = coa_analytics_daily.clicks_qr_code +
            CASE WHEN NEW.link_source = 'qr_code' THEN 1 ELSE 0 END,
        clicks_purchase_link = coa_analytics_daily.clicks_purchase_link +
            CASE WHEN NEW.link_source = 'purchase_link' THEN 1 ELSE 0 END,
        views_desktop = coa_analytics_daily.views_desktop +
            CASE WHEN NEW.device_type = 'desktop' THEN 1 ELSE 0 END,
        views_mobile = coa_analytics_daily.views_mobile +
            CASE WHEN NEW.device_type = 'mobile' THEN 1 ELSE 0 END,
        views_tablet = coa_analytics_daily.views_tablet +
            CASE WHEN NEW.device_type = 'tablet' THEN 1 ELSE 0 END,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update daily analytics
CREATE TRIGGER trigger_update_daily_analytics
    AFTER INSERT ON public.coa_scans
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_analytics();

-- ============================================
-- 9. Views for Easy Querying
-- ============================================

-- View: COA analytics with owner info
CREATE OR REPLACE VIEW public.v_coa_analytics AS
SELECT
    c.id as coa_id,
    c.public_token,
    c.coa_number,
    c.batch_id,
    c.client_id,
    cl.name as client_name,
    cl.email as client_email,
    COUNT(s.id) as total_views,
    COUNT(DISTINCT s.ip_hash) as unique_visitors,
    COUNT(CASE WHEN s.access_type = 'direct_link' THEN 1 END) as direct_link_views,
    COUNT(CASE WHEN s.access_type = 'qr_global' THEN 1 END) as qr_views,
    COUNT(CASE WHEN s.access_type = 'cvv_verification' THEN 1 END) as cvv_views,
    COUNT(CASE WHEN s.access_type = 'pdf_link' THEN 1 END) as pdf_link_views,
    MAX(s.scanned_at) as last_viewed_at,
    MIN(s.scanned_at) as first_viewed_at
FROM public.coas c
LEFT JOIN public.clients cl ON c.client_id = cl.id
LEFT JOIN public.coa_scans s ON c.id = s.coa_id
GROUP BY c.id, c.public_token, c.coa_number, c.batch_id, c.client_id, cl.name, cl.email;

-- View: Client dashboard summary
CREATE OR REPLACE VIEW public.v_client_dashboard AS
SELECT
    cl.id as client_id,
    cl.name as client_name,
    cl.email,
    COUNT(DISTINCT c.id) as total_coas,
    COALESCE(SUM(
        (SELECT COUNT(*) FROM public.coa_scans s WHERE s.coa_id = c.id)
    ), 0) as total_views,
    COALESCE(SUM(
        (SELECT COUNT(*) FROM public.coa_scans s
         WHERE s.coa_id = c.id
         AND s.scanned_at >= NOW() - INTERVAL '30 days')
    ), 0) as views_last_30_days,
    COALESCE(SUM(
        (SELECT COUNT(*) FROM public.coa_scans s
         WHERE s.coa_id = c.id
         AND s.scanned_at >= NOW() - INTERVAL '7 days')
    ), 0) as views_last_7_days
FROM public.clients cl
LEFT JOIN public.coas c ON cl.id = c.client_id
GROUP BY cl.id, cl.name, cl.email;

-- ============================================
-- 10. Sample Query Comments
-- ============================================
/*
-- Get all scans for a specific COA with details:
SELECT * FROM public.coa_scans WHERE coa_id = 'uuid-here' ORDER BY scanned_at DESC;

-- Get daily stats for a COA:
SELECT * FROM public.coa_analytics_daily WHERE coa_id = 'uuid-here' ORDER BY date DESC;

-- Get all COA analytics for a client (owner):
SELECT * FROM public.v_coa_analytics WHERE client_id = 'client-uuid-here';

-- Get suspicious activity for a COA:
SELECT * FROM public.suspicious_activity WHERE coa_id = 'uuid-here' AND is_resolved = FALSE;

-- Top 10 most viewed COAs:
SELECT * FROM public.v_coa_analytics ORDER BY total_views DESC LIMIT 10;

-- Access breakdown by type for super admin:
SELECT
    access_type,
    COUNT(*) as count,
    COUNT(DISTINCT coa_id) as unique_coas
FROM public.coa_scans
WHERE scanned_at >= NOW() - INTERVAL '30 days'
GROUP BY access_type;
*/

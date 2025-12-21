-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COAs Table
CREATE TABLE public.coas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    public_token TEXT NOT NULL UNIQUE, -- The token used in the URL
    
    -- Extracted Data
    lab_report_number TEXT,
    lab_name TEXT, 
    analysis_date DATE,
    
    -- Product Mapping
    product_sku TEXT,
    shopify_product_id TEXT,
    shopify_variant_id TEXT,
    batch_id TEXT,
    
    -- JSON Data
    cannabinoids JSONB DEFAULT '[]'::JSONB, -- Standardized array: [{analyte, result_pct, result_mg_g, ...}]
    metadata JSONB DEFAULT '{}'::JSONB,     -- Extra info (matrix, client, etc.)
    
    -- Compliance & Status
    compliance_status TEXT DEFAULT 'pending' CHECK (compliance_status IN ('pending', 'pass', 'fail', 'revoked')),
    thc_compliance_flag BOOLEAN DEFAULT FALSE,
    
    -- Files
    pdf_url_original TEXT,
    pdf_url_branded TEXT,
    
    -- Ownership
    owner_type TEXT DEFAULT 'eum', -- 'eum' or 'distributor'
    owner_id TEXT,                 -- UUID of distributor if applicable
    
    -- COA Enrichment (Phase 5)
    product_image_url TEXT, -- Product image
    watermark_url TEXT, -- Custom watermark/logo
    purchase_links JSONB DEFAULT '[]'::jsonb, -- [{label, url}]
    additional_docs JSONB DEFAULT '[]'::jsonb, -- [{type, filename, url}]
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by token
CREATE INDEX idx_coas_token ON public.coas(public_token);
-- Index for product lookups
CREATE INDEX idx_coas_sku ON public.coas(product_sku);

-- 2. COA Scans Table (Analytics)
CREATE TABLE public.coa_scans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID REFERENCES public.coas(id) ON DELETE CASCADE,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    
    -- Geo-location (stored as JSON for flexibility)
    geo_data JSONB
);

CREATE INDEX idx_scans_coa_id ON public.coa_scans(coa_id);

-- 3. Products Table (Shadow Helper, optional but good for joins)
CREATE TABLE public.products (
    sku TEXT PRIMARY KEY,
    name TEXT,
    image_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.5 Verification Codes (CVV Anti-Fraud System)
CREATE TABLE public.verification_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID REFERENCES public.coas(id) ON DELETE CASCADE, -- NULL = unassigned/inventory
    cvv_code TEXT NOT NULL UNIQUE, -- 8-character verification code
    label_id TEXT, -- Optional label/batch identifier for bulk generation
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE, -- When it was assigned to a COA
    first_scanned_at TIMESTAMP WITH TIME ZONE,
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    scan_count INTEGER DEFAULT 0,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT
);

-- Index for fast CVV lookup
CREATE INDEX idx_verification_codes_cvv ON public.verification_codes(cvv_code);
CREATE INDEX idx_verification_codes_coa_id ON public.verification_codes(coa_id);

-- 4. Distributors (Future use)
CREATE TABLE public.distributors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    contact_email TEXT,
    api_key TEXT, -- Encrypted or hashed in real app
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) Policies - Placeholder
-- In production, you'd enable RLS so only authenticated admin can write to 'coas'
ALTER TABLE public.coas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coa_scans ENABLE ROW LEVEL SECURITY;

-- Phase 7: Add default template to clients (for pre-selected templates)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES public.pdf_templates(id);

-- Allow public read access to COAs via token? 
-- Actually, the API will likely handle this with a service key, 
-- but for Supabase client-side access, we might need a policy like:
-- CREATE POLICY "Public COA Access" ON public.coas FOR SELECT USING (true);

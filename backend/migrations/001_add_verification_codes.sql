-- Migration: Add verification_codes table
-- Created: 2025-12-09

-- Create verification_codes table for CVV anti-fraud system
CREATE TABLE IF NOT EXISTS public.verification_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID REFERENCES public.coas(id) ON DELETE CASCADE,
    cvv_code TEXT NOT NULL UNIQUE,
    label_id TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    first_scanned_at TIMESTAMP WITH TIME ZONE,
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    scan_count INTEGER DEFAULT 0,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_verification_codes_cvv ON public.verification_codes(cvv_code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_coa_id ON public.verification_codes(coa_id);

-- Enable RLS
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Comment
COMMENT ON TABLE public.verification_codes IS 'Stores unique CVV codes for product authentication';

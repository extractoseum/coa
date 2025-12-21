-- Migration: COA Enrichment - Add product images, watermarks, links, and docs
-- Date: 2025-12-10

-- Add new columns for COA enrichment
ALTER TABLE public.coas 
ADD COLUMN IF NOT EXISTS product_image_url TEXT,
ADD COLUMN IF NOT EXISTS watermark_url TEXT,
ADD COLUMN IF NOT EXISTS purchase_links JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS additional_docs JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.coas.product_image_url IS 'URL to product image in storage';
COMMENT ON COLUMN public.coas.watermark_url IS 'URL to custom watermark/logo overlay';
COMMENT ON COLUMN public.coas.purchase_links IS 'Array of {label: string, url: string} for purchase links';
COMMENT ON COLUMN public.coas.additional_docs IS 'Array of {type: string, filename: string, url: string} for extra documents';

-- Extended metadata is already JSONB in metadata column, no schema change needed
-- Will store: client_name, client_reference, received_date, sample_condition, etc.

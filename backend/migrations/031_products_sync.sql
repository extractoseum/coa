-- Migration: 031_products_sync.sql
-- Description: Create products table for local synchronization from Shopify

CREATE TABLE IF NOT EXISTS public.products (
    id BIGINT PRIMARY KEY, -- Shopify Product ID
    title TEXT NOT NULL,
    handle TEXT NOT NULL,
    product_type TEXT,
    vendor TEXT,
    
    -- Search Optimization
    tags TEXT[], -- Array of tags for fast filtering
    
    -- JSON Data for flexible storage
    variants JSONB DEFAULT '[]'::JSONB, -- [{id, title, price, sku, inventory_quantity}]
    images JSONB DEFAULT '[]'::JSONB,   -- [{id, src, alt}]
    
    -- Status
    status TEXT DEFAULT 'active', -- active, archived, draft
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast AI lookup
CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON public.products USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_tags ON public.products USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_products_handle ON public.products(handle);

-- Enable RLS just in case (though mostly backend access)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users (admin dashboard)
CREATE POLICY "Allow read access to authenticated users" ON public.products FOR SELECT USING (auth.role() = 'authenticated');

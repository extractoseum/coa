-- Migration: 051_products_enrichment.sql
-- Description: Add enrichment fields to products table for AI knowledge

-- Add description field (HTML from Shopify body_html)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;

-- Add plain text description (stripped HTML for AI)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_plain TEXT;

-- Add metafields storage (for custom fields like dosage, ingredients)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS metafields JSONB DEFAULT '{}'::JSONB;

-- Add enrichment metadata
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS enrichment JSONB DEFAULT '{}'::JSONB;
-- Structure: { cannabinoids: [], effects: [], usage: "", dosage: "", ingredients: [] }

-- Add embedding for semantic search
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add full-text search vector
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create index for semantic search
CREATE INDEX IF NOT EXISTS idx_products_embedding ON public.products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for full-text search
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON public.products USING GIN (search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('spanish', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('spanish', COALESCE(NEW.description_plain, '')), 'B') ||
        setweight(to_tsvector('spanish', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating search vector
DROP TRIGGER IF EXISTS products_search_vector_trigger ON public.products;
CREATE TRIGGER products_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, description_plain, tags
    ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION products_search_vector_update();

-- Comment for documentation
COMMENT ON COLUMN public.products.description IS 'HTML description from Shopify body_html';
COMMENT ON COLUMN public.products.description_plain IS 'Plain text for AI (HTML stripped)';
COMMENT ON COLUMN public.products.metafields IS 'Custom metafields from Shopify';
COMMENT ON COLUMN public.products.enrichment IS 'AI-enhanced product info: cannabinoids, effects, usage';
COMMENT ON COLUMN public.products.embedding IS 'Vector embedding for semantic search';

-- Migration: 075_sour_mappings.sql
-- Created: 2026-01-09
-- Description: Add missing search mappings for sour/ácido products
-- Issue: Call 019ba384-e094-7332-a8ca-3dc0e2a21f3c failed to find "Sour Extreme" products

-- Add sour/ácido mappings
INSERT INTO search_term_mappings (search_term, mapped_terms, source, confidence_score, is_active, notes)
VALUES
    ('acido', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish for sour - maps to Sour Extreme products'),
    ('acida', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish feminine for sour'),
    ('acidos', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish plural for sour'),
    ('acidas', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish feminine plural for sour'),
    ('ácido', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish with accent for sour'),
    ('ácida', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish feminine with accent'),
    ('ácidos', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish plural with accent'),
    ('ácidas', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'Spanish feminine plural with accent'),
    ('sour', ARRAY['sour', 'extreme', 'candy', 'gummies'], 'manual', 0.95, true, 'English sour'),
    ('caramelo', ARRAY['candy', 'caramel', 'cream', 'comestibles', 'bites'], 'manual', 0.90, true, 'Spanish for candy/caramel'),
    ('caramelos', ARRAY['candy', 'caramel', 'cream', 'comestibles', 'bites'], 'manual', 0.90, true, 'Spanish plural for candies'),
    ('dulces', ARRAY['candy', 'comestibles', 'gummies', 'bites', 'cream'], 'manual', 0.90, true, 'Spanish for sweets')
ON CONFLICT DO NOTHING;

-- Update existing recreativo mapping to include sour products
UPDATE search_term_mappings
SET mapped_terms = ARRAY['comestibles', 'delta', 'hhc', 'thc', 'bites', 'candy', 'sour', 'gummies', 'extreme'],
    updated_at = NOW()
WHERE LOWER(search_term) = 'recreativo' AND is_active = true;

-- Update gomitas mapping to include sour
UPDATE search_term_mappings
SET mapped_terms = ARRAY['comestibles', 'gummies', 'hot bites', 'candy', 'bites', 'sour', 'extreme'],
    updated_at = NOW()
WHERE LOWER(search_term) = 'gomitas' AND is_active = true;

-- Update comestibles mapping
UPDATE search_term_mappings
SET mapped_terms = ARRAY['comestibles', 'gummies', 'edibles', 'bites', 'candy', 'sour', 'extreme'],
    updated_at = NOW()
WHERE LOWER(search_term) = 'comestibles' AND is_active = true;

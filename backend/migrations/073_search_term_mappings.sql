-- Migration: 073_search_term_mappings.sql
-- Created: 2025-01-09
-- Description: Auto-learning search term mappings for VAPI product search
-- Enables dynamic improvement of search without code changes

-- =============================================
-- Search Term Mappings Table
-- Stores learned mappings from user searches to actual product terms
-- =============================================

CREATE TABLE IF NOT EXISTS search_term_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The Mapping
    search_term VARCHAR(100) NOT NULL,      -- What user says: "gomitas"
    mapped_terms TEXT[] NOT NULL,           -- What we search: ['comestibles', 'bites', 'candy']
    product_types TEXT[],                   -- Specific product_type matches

    -- Source & Attribution
    source VARCHAR(50) NOT NULL DEFAULT 'manual',  -- 'manual', 'auto_learned', 'ai_suggested'
    learned_from_call_id VARCHAR(100),      -- VAPI call that taught us this
    learned_from_tool_log_id UUID REFERENCES vapi_tool_logs(id),
    created_by UUID,                        -- User who created (if manual)

    -- Confidence & Usage Stats
    confidence_score NUMERIC(3,2) DEFAULT 0.50,  -- 0.00 to 1.00
    times_used INTEGER DEFAULT 0,
    times_successful INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Review Status
    is_active BOOLEAN DEFAULT true,
    requires_review BOOLEAN DEFAULT false,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on active search terms
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_mappings_term_unique
    ON search_term_mappings(LOWER(search_term))
    WHERE is_active = true;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_search_mappings_active
    ON search_term_mappings(search_term)
    WHERE is_active = true;

-- Index for review queue
CREATE INDEX IF NOT EXISTS idx_search_mappings_review
    ON search_term_mappings(created_at)
    WHERE requires_review = true;

-- Enable RLS
ALTER TABLE search_term_mappings ENABLE ROW LEVEL SECURITY;

-- Policy for service role
CREATE POLICY "Service role full access to search_term_mappings"
    ON search_term_mappings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comments
COMMENT ON TABLE search_term_mappings IS 'Auto-learned mappings from user search terms to product keywords';
COMMENT ON COLUMN search_term_mappings.search_term IS 'User search term (lowercase): gomitas, aceite, recreativo';
COMMENT ON COLUMN search_term_mappings.mapped_terms IS 'Array of terms to search in products table';
COMMENT ON COLUMN search_term_mappings.confidence_score IS 'Confidence 0-1, increases with successful uses';
COMMENT ON COLUMN search_term_mappings.source IS 'How mapping was created: manual, auto_learned, ai_suggested';

-- =============================================
-- Seed Initial Mappings (from current hardcoded values)
-- =============================================

INSERT INTO search_term_mappings (search_term, mapped_terms, source, confidence_score, is_active)
VALUES
    ('gomitas', ARRAY['comestibles', 'gummies', 'hot bites', 'candy', 'bites'], 'manual', 0.90, true),
    ('gummies', ARRAY['comestibles', 'gummies', 'hot bites', 'candy'], 'manual', 0.90, true),
    ('comestibles', ARRAY['comestibles', 'gummies', 'edibles', 'bites'], 'manual', 0.90, true),
    ('tintura', ARRAY['tinturas', 'aceite', 'oil', 'tintura'], 'manual', 0.90, true),
    ('tinturas', ARRAY['tinturas', 'aceite', 'oil'], 'manual', 0.90, true),
    ('topico', ARRAY['topicos', 'crema', 'stick', 'freezing'], 'manual', 0.90, true),
    ('topicos', ARRAY['topicos', 'crema', 'stick', 'freezing'], 'manual', 0.90, true),
    ('crema', ARRAY['topicos', 'crema', 'stick', 'freezing'], 'manual', 0.90, true),
    ('aceite', ARRAY['tinturas', 'aceite', 'oil'], 'manual', 0.90, true),
    ('recreativo', ARRAY['comestibles', 'delta', 'hhc', 'thc', 'bites'], 'manual', 0.90, true),
    ('cbd', ARRAY['cbd', 'cannabidiol', 'freezing'], 'manual', 0.90, true),
    ('hhc', ARRAY['hhc', 'hexahidrocannabinol', 'delta'], 'manual', 0.90, true),
    ('delta', ARRAY['delta', 'delta 8', 'delta 9', 'bites'], 'manual', 0.90, true),
    ('cannabinoides', ARRAY['cbd', 'hhc', 'delta', 'thc', 'cbg', 'cbn'], 'manual', 0.85, true),
    ('materia prima', ARRAY['cbd', 'hhc', 'cbg', 'cbn', 'isolate', 'distillate'], 'manual', 0.85, true),
    ('aislado', ARRAY['isolate', 'aislado', 'cbd', 'hhc'], 'manual', 0.85, true),
    ('destilado', ARRAY['distillate', 'destilado', 'hhc', 'delta'], 'manual', 0.85, true)
ON CONFLICT DO NOTHING;

-- =============================================
-- Function: Update mapping stats on use
-- =============================================

CREATE OR REPLACE FUNCTION update_mapping_stats(
    p_search_term VARCHAR(100),
    p_was_successful BOOLEAN
)
RETURNS VOID AS $$
BEGIN
    UPDATE search_term_mappings
    SET
        times_used = times_used + 1,
        times_successful = CASE WHEN p_was_successful THEN times_successful + 1 ELSE times_successful END,
        last_used_at = NOW(),
        -- Adjust confidence based on success rate
        confidence_score = LEAST(1.0, GREATEST(0.1,
            (times_successful + CASE WHEN p_was_successful THEN 1 ELSE 0 END)::NUMERIC /
            NULLIF(times_used + 1, 0)
        )),
        updated_at = NOW()
    WHERE LOWER(search_term) = LOWER(p_search_term)
      AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: Create auto-learned mapping
-- =============================================

CREATE OR REPLACE FUNCTION create_learned_mapping(
    p_search_term VARCHAR(100),
    p_mapped_terms TEXT[],
    p_call_id VARCHAR(100),
    p_tool_log_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_mapping_id UUID;
BEGIN
    INSERT INTO search_term_mappings (
        search_term,
        mapped_terms,
        source,
        learned_from_call_id,
        learned_from_tool_log_id,
        confidence_score,
        requires_review,
        is_active
    )
    VALUES (
        LOWER(p_search_term),
        p_mapped_terms,
        'auto_learned',
        p_call_id,
        p_tool_log_id,
        0.50,  -- Start with medium confidence
        true,  -- Requires review before full activation
        true   -- Active but with lower confidence
    )
    ON CONFLICT (LOWER(search_term)) WHERE is_active = true
    DO UPDATE SET
        -- Merge mapped terms
        mapped_terms = ARRAY(
            SELECT DISTINCT unnest(search_term_mappings.mapped_terms || p_mapped_terms)
        ),
        updated_at = NOW()
    RETURNING id INTO v_mapping_id;

    RETURN v_mapping_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- View: Active Mappings for API
-- =============================================

CREATE OR REPLACE VIEW active_search_mappings AS
SELECT
    search_term,
    mapped_terms,
    product_types,
    confidence_score,
    times_used,
    times_successful,
    source
FROM search_term_mappings
WHERE is_active = true
  AND confidence_score >= 0.30  -- Minimum confidence threshold
ORDER BY confidence_score DESC, times_used DESC;

COMMENT ON VIEW active_search_mappings IS 'Active search mappings with minimum confidence for use in product search';

-- =============================================
-- View: Mappings Pending Review
-- =============================================

CREATE OR REPLACE VIEW search_mappings_pending_review AS
SELECT
    id,
    search_term,
    mapped_terms,
    source,
    confidence_score,
    times_used,
    times_successful,
    learned_from_call_id,
    created_at
FROM search_term_mappings
WHERE requires_review = true
  AND reviewed_at IS NULL
ORDER BY times_used DESC, created_at DESC;

COMMENT ON VIEW search_mappings_pending_review IS 'Auto-learned mappings awaiting human review';

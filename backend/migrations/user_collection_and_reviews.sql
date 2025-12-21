-- =====================================================
-- Migration: User Collection & Reviews System
-- Date: 2025-12-16
-- Description: Tables for user COA collections and reviews
-- =====================================================

-- 1. User Saved COAs (Collection)
-- Allows users to save COAs they've scanned or visited
CREATE TABLE IF NOT EXISTS user_saved_coas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    coa_id UUID NOT NULL REFERENCES coas(id) ON DELETE CASCADE,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,  -- Personal notes like "Me gustó", "Muy relajante"

    UNIQUE(client_id, coa_id)  -- A COA can only be saved once per user
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_saved_coas_client ON user_saved_coas(client_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_coas_coa ON user_saved_coas(coa_id);

-- 2. COA Reviews
-- Allows users to rate and review COAs
CREATE TABLE IF NOT EXISTS coa_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coa_id UUID NOT NULL REFERENCES coas(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Rating (1-5 stars)
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),

    -- Review text
    review_text TEXT,

    -- Owner control
    is_approved BOOLEAN DEFAULT FALSE,   -- If owner needs to approve
    is_visible BOOLEAN DEFAULT TRUE,     -- If publicly visible

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(coa_id, client_id)  -- One review per user per COA
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_coa_reviews_coa ON coa_reviews(coa_id);
CREATE INDEX IF NOT EXISTS idx_coa_reviews_client ON coa_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_coa_reviews_approved ON coa_reviews(coa_id, is_approved, is_visible);

-- 3. Add review settings to COAs table
ALTER TABLE coas ADD COLUMN IF NOT EXISTS reviews_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE coas ADD COLUMN IF NOT EXISTS reviews_require_approval BOOLEAN DEFAULT TRUE;

-- 4. Verification tokens for quick-register
CREATE TABLE IF NOT EXISTS verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,           -- email or phone
    code TEXT NOT NULL,                 -- 6-digit code
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_tokens(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires ON verification_tokens(expires_at);

-- 5. Add auth_level to clients table for tracking verification status
ALTER TABLE clients ADD COLUMN IF NOT EXISTS auth_level TEXT DEFAULT 'registered'
    CHECK (auth_level IN ('registered', 'verified'));

-- 6. Helper function to get review stats for a COA
CREATE OR REPLACE FUNCTION get_coa_review_stats(p_coa_id UUID)
RETURNS TABLE (
    avg_rating NUMERIC,
    review_count BIGINT,
    rating_distribution JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ROUND(AVG(rating)::NUMERIC, 1) as avg_rating,
        COUNT(*) as review_count,
        jsonb_build_object(
            '5', COUNT(*) FILTER (WHERE rating = 5),
            '4', COUNT(*) FILTER (WHERE rating = 4),
            '3', COUNT(*) FILTER (WHERE rating = 3),
            '2', COUNT(*) FILTER (WHERE rating = 2),
            '1', COUNT(*) FILTER (WHERE rating = 1)
        ) as rating_distribution
    FROM coa_reviews
    WHERE coa_id = p_coa_id
      AND is_visible = TRUE
      AND is_approved = TRUE;
END;
$$ LANGUAGE plpgsql;

-- 7. Clean up expired verification tokens (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM verification_tokens
    WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust if needed for your Supabase setup)
-- These are typically auto-granted by Supabase service role

COMMENT ON TABLE user_saved_coas IS 'User personal collection of saved COAs';
COMMENT ON TABLE coa_reviews IS 'User reviews and ratings for COAs';
COMMENT ON TABLE verification_tokens IS 'Temporary codes for quick registration verification';

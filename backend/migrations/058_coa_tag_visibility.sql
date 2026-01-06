-- Migration: COA Tag-Based Visibility
-- Allows restricting COA visibility to customers with specific Shopify tags
-- Date: 2025-01-06

-- Add visibility_mode column (replaces is_hidden logic with 3 states)
ALTER TABLE public.coas
ADD COLUMN IF NOT EXISTS visibility_mode TEXT DEFAULT 'public'
CHECK (visibility_mode IN ('public', 'hidden', 'tag_restricted'));

-- Add required_tags column (array of Shopify tags required to view this COA)
ALTER TABLE public.coas
ADD COLUMN IF NOT EXISTS required_tags TEXT[] DEFAULT '{}';

-- Migrate existing is_hidden data to new visibility_mode
UPDATE public.coas
SET visibility_mode = CASE
    WHEN is_hidden = true THEN 'hidden'
    ELSE 'public'
END
WHERE visibility_mode IS NULL OR visibility_mode = 'public';

-- Create index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_coas_visibility_mode ON public.coas(visibility_mode);
CREATE INDEX IF NOT EXISTS idx_coas_required_tags ON public.coas USING gin(required_tags);

-- Comments explaining the fields
COMMENT ON COLUMN public.coas.visibility_mode IS 'Visibility mode: public (all), hidden (owner only), tag_restricted (specific Shopify customer tags)';
COMMENT ON COLUMN public.coas.required_tags IS 'Array of Shopify customer tags required to view this COA when visibility_mode is tag_restricted';

-- Create a helper function to check if user has required tags
CREATE OR REPLACE FUNCTION check_user_has_tags(user_tags TEXT[], required_tags TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
    -- Return true if user has at least one of the required tags
    RETURN user_tags && required_tags;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION check_user_has_tags IS 'Returns true if user_tags array contains at least one tag from required_tags array';

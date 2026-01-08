-- 065_shopify_client_enrichment.sql
-- Enrich clients table with Shopify customer metrics for better ghost detection and personalization

-- Add Shopify customer metrics to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_orders_count INTEGER DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_total_spent DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_tags TEXT; -- Comma-separated tags from Shopify
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_last_order_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_accepts_marketing BOOLEAN DEFAULT FALSE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_state TEXT; -- 'enabled', 'disabled', etc.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_synced_at TIMESTAMP WITH TIME ZONE;

-- Computed customer segment based on metrics
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS customer_segment TEXT DEFAULT 'unknown';
-- Possible values: 'vip', 'regular', 'new', 'one_time', 'at_risk', 'churned', 'unknown'

-- Index for faster ghost queries
CREATE INDEX IF NOT EXISTS idx_clients_shopify_orders ON public.clients(shopify_orders_count);
CREATE INDEX IF NOT EXISTS idx_clients_shopify_spent ON public.clients(shopify_total_spent);
CREATE INDEX IF NOT EXISTS idx_clients_customer_segment ON public.clients(customer_segment);
CREATE INDEX IF NOT EXISTS idx_clients_shopify_last_order ON public.clients(shopify_last_order_date);

-- Function to calculate customer segment based on metrics
CREATE OR REPLACE FUNCTION calculate_customer_segment(
    orders_count INTEGER,
    total_spent DECIMAL,
    last_order_date TIMESTAMP WITH TIME ZONE
) RETURNS TEXT AS $$
DECLARE
    days_since_order INTEGER;
BEGIN
    -- Calculate days since last order
    IF last_order_date IS NOT NULL THEN
        days_since_order := EXTRACT(DAY FROM (NOW() - last_order_date));
    ELSE
        days_since_order := NULL;
    END IF;

    -- Segmentation logic
    IF orders_count >= 5 AND total_spent >= 5000 THEN
        IF days_since_order IS NOT NULL AND days_since_order > 60 THEN
            RETURN 'vip_at_risk';
        ELSE
            RETURN 'vip';
        END IF;
    ELSIF orders_count >= 3 OR total_spent >= 2000 THEN
        RETURN 'regular';
    ELSIF orders_count = 1 THEN
        RETURN 'one_time';
    ELSIF orders_count = 0 THEN
        RETURN 'new';
    ELSE
        RETURN 'unknown';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add new ghost levels to ghost_alerts if not exists
-- (The constraint might need to be updated)
DO $$
BEGIN
    -- Check if constraint exists and drop it to add new values
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ghost_alerts_ghost_level_check'
    ) THEN
        ALTER TABLE ghost_alerts DROP CONSTRAINT ghost_alerts_ghost_level_check;
    END IF;

    -- Add updated constraint with new ghost types
    ALTER TABLE ghost_alerts ADD CONSTRAINT ghost_alerts_ghost_level_check
        CHECK (ghost_level IN (
            'warm_ghost',      -- 14-30 days inactive
            'cold_ghost',      -- 31-60 days inactive
            'frozen_ghost',    -- 61-90 days inactive
            'churned',         -- 90+ days inactive
            'vip_at_risk',     -- VIP customer showing inactivity signs
            'one_time_buyer',  -- Single purchase, never returned
            'big_spender_lapsed' -- High total_spent but inactive
        ));
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not update ghost_level constraint: %', SQLERRM;
END;
$$;

-- Comments
COMMENT ON COLUMN public.clients.shopify_orders_count IS 'Total orders from Shopify';
COMMENT ON COLUMN public.clients.shopify_total_spent IS 'Total amount spent from Shopify';
COMMENT ON COLUMN public.clients.shopify_tags IS 'Customer tags from Shopify (comma-separated)';
COMMENT ON COLUMN public.clients.shopify_last_order_date IS 'Date of most recent order from Shopify';
COMMENT ON COLUMN public.clients.customer_segment IS 'Computed segment: vip, regular, new, one_time, at_risk, churned';
COMMENT ON FUNCTION calculate_customer_segment IS 'Calculate customer segment based on order metrics';

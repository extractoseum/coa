-- 024_multi_tracking_support.sql
-- Support for multiple fulfillments and multiple tracking numbers per order

-- 1. Remove the unique constraint on order_id if it exists
-- Migration 023 (failed or partial) might have tried to add this.
-- We must remove it to allow multiple rows per order_id.
ALTER TABLE order_tracking DROP CONSTRAINT IF EXISTS order_tracking_order_id_key;

-- 2. Add shopify_fulfillment_id to track individual fulfillments
ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS shopify_fulfillment_id TEXT;

-- 3. Add a composite unique constraint on (order_id, tracking_number)
-- This allows multiple different tracking numbers for the same order.
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_tracking_order_num_unique') THEN
        ALTER TABLE order_tracking ADD CONSTRAINT order_tracking_order_num_unique UNIQUE (order_id, tracking_number);
    END IF;
END $$;

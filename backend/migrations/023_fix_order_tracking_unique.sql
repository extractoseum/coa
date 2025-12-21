-- 023_fix_order_tracking_unique.sql
-- Add unique constraint to order_id in order_tracking table for UPSERT support

ALTER TABLE order_tracking ADD CONSTRAINT order_tracking_order_id_key UNIQUE (order_id);

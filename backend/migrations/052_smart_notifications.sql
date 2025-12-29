-- =====================================================
-- Migration: Smart Notifications Enhancements
-- Date: 2025-12-29
-- Description: Add idempotency key for deduplication and
--              index for efficient deduplication queries
-- =====================================================

-- 1. Add idempotency_key to push_notifications for preventing duplicate sends
ALTER TABLE push_notifications
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index for idempotency (allows NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_notifications_idempotency
ON push_notifications(idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- 2. Add index to system_logs for efficient deduplication queries
-- These queries filter by (event_type, client_id, created_at)
CREATE INDEX IF NOT EXISTS idx_system_logs_dedup
ON system_logs(event_type, client_id, created_at DESC);

-- 3. Add fulfilled_notified column to orders if not exists
-- This prevents duplicate "Order Shipped" notifications
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS fulfilled_notified BOOLEAN DEFAULT FALSE;

-- 4. Add financial_status and fulfillment_status to orders for recovery checks
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS financial_status TEXT;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;

-- 5. Comments
COMMENT ON COLUMN push_notifications.idempotency_key IS 'Unique key to prevent duplicate notifications from double-clicks or retries';
COMMENT ON COLUMN orders.fulfilled_notified IS 'Flag to prevent duplicate Order Shipped notifications';
COMMENT ON COLUMN orders.financial_status IS 'Shopify payment status (paid, pending, etc)';
COMMENT ON COLUMN orders.fulfillment_status IS 'Shopify fulfillment status (fulfilled, partial, null)';

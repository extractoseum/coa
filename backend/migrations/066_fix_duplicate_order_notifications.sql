-- Migration: Fix Duplicate Order Notifications
-- Created: 2025-01-08
-- Description: Adds paid_notified flag to prevent duplicate "Pedido Recibido" notifications
--              when Shopify sends both order-create and order-updated webhooks simultaneously.

-- Add paid_notified column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS paid_notified BOOLEAN DEFAULT false;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_orders_paid_notified ON orders(paid_notified) WHERE paid_notified = false;

-- Comment explaining the column
COMMENT ON COLUMN orders.paid_notified IS 'Flag to prevent duplicate order confirmation notifications when multiple webhooks fire simultaneously';

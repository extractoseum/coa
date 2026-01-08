-- 062_orders_line_items.sql
-- Add line_items column to orders table for Oracle predictive restocking
-- This stores the array of products purchased in each order

-- Add line_items column (JSONB array)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;

-- Add customer_email and customer_phone for faster Oracle lookups
-- (These are currently only available via client_id join)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Index for Oracle queries that filter by customer
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_line_items ON orders USING GIN(line_items);

-- Backfill customer_email from clients table for existing orders
UPDATE orders o
SET customer_email = c.email,
    customer_phone = c.phone
FROM clients c
WHERE o.client_id = c.id
AND o.customer_email IS NULL;

COMMENT ON COLUMN orders.line_items IS 'JSONB array of line items from Shopify order, each with product_id, variant_id, title, quantity, price';
COMMENT ON COLUMN orders.customer_email IS 'Denormalized customer email for faster Oracle queries';
COMMENT ON COLUMN orders.customer_phone IS 'Denormalized customer phone for faster Oracle queries';

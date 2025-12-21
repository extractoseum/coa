-- Migration: Add contact fields to orders for robust linking
-- Description: Adds customer_email and customer_phone to orders table to allow linking by handle even if client_id is missing.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);

-- Force schema cache reload just in case
NOTIFY pgrst, 'reload schema';

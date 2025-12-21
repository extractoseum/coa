-- 026_abandoned_recovery.sql
-- Tracking and automation for recovery of abandoned orders and checkouts

-- 1. Add recovery fields to existing orders table
-- These are for orders that were created but have "pending" payment status (e.g. Mercado Pago)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_status TEXT DEFAULT 'none'; -- 'none', 'pending', 'reminded', 'recovered'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS abandoned_checkout_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_next_check_at TIMESTAMP WITH TIME ZONE;

-- 2. Create abandoned_checkouts table
-- This captures data from checkouts/create webhooks (users who didn't even place the order)
CREATE TABLE IF NOT EXISTS abandoned_checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_checkout_id BIGINT UNIQUE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    email TEXT,
    phone TEXT,
    customer_name TEXT,
    checkout_url TEXT NOT NULL,
    total_price DECIMAL(10, 2),
    currency TEXT DEFAULT 'MXN',
    recovery_status TEXT DEFAULT 'pending', -- 'pending', 'reminded', 'recovered', 'expired'
    recovery_next_check_at TIMESTAMP WITH TIME ZONE,
    shopify_created_at TIMESTAMP WITH TIME ZONE,
    shopify_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create recovery_logs table for auditing
CREATE TABLE IF NOT EXISTS recovery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    checkout_id UUID REFERENCES abandoned_checkouts(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    recovery_type TEXT NOT NULL, -- 'abandoned_order' or 'abandoned_checkout'
    channel TEXT NOT NULL, -- 'whatsapp', 'email', 'push'
    status TEXT NOT NULL, -- 'sent', 'failed'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_recovery_status ON orders(recovery_status);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_shopify_id ON abandoned_checkouts(shopify_checkout_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_status ON abandoned_checkouts(recovery_status);
CREATE INDEX IF NOT EXISTS idx_recovery_logs_client ON recovery_logs(client_id);

-- 5. Helper comments
COMMENT ON COLUMN orders.recovery_status IS 'Tracks the state of payment recovery for pending orders';
COMMENT ON TABLE abandoned_checkouts IS 'Stores checkouts that were initiated but not completed';
COMMENT ON TABLE recovery_logs IS 'Audit trail for automated recovery notifications sent to clients';

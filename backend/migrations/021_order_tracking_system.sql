-- 021_order_tracking_system.sql
-- Database schema for Shopify Orders and Tracking info

-- 1. Create Orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    shopify_order_id BIGINT UNIQUE NOT NULL,
    order_number TEXT NOT NULL, -- Format EUM_0000_SHOP
    status TEXT NOT NULL, -- e.g., 'created', 'fulfilled', 'cancelled', 'delivered'
    total_amount DECIMAL(10, 2),
    currency TEXT DEFAULT 'MXN',
    shopify_created_at TIMESTAMP WITH TIME ZONE,
    shopify_updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Order Tracking table
CREATE TABLE IF NOT EXISTS order_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    carrier TEXT, -- 'Estafeta', 'Uber', etc.
    tracking_number TEXT,
    tracking_url TEXT,
    current_status TEXT DEFAULT 'pending', -- 'pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception'
    last_checked_at TIMESTAMP WITH TIME ZONE,
    status_history JSONB DEFAULT '[]', -- Array of { status, detail, timestamp, location }
    estimated_delivery TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_tracking_order_id ON order_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tracking_number ON order_tracking(tracking_number);

-- 4. Sync metadata (ensures table exists if migration 015 wasn't run)
CREATE TABLE IF NOT EXISTS shopify_sync_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type TEXT NOT NULL,  -- 'customers', 'orders', etc.
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_count INTEGER DEFAULT 0,
    last_sync_duration_seconds INTEGER,
    status TEXT DEFAULT 'idle',  -- 'idle', 'running', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(sync_type)
);

-- Initial sync metadata for orders
INSERT INTO shopify_sync_metadata (sync_type, status)
VALUES ('orders', 'idle')
ON CONFLICT (sync_type) DO NOTHING;

-- Comments
COMMENT ON TABLE orders IS 'Stores basic information about Shopify orders for notifications and tracking dashboard';
COMMENT ON TABLE order_tracking IS 'Stores tracking numbers and real-time shipment status for orders';

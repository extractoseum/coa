-- 015_shopify_customers_backup.sql
-- Sistema de respaldo de clientes de Shopify

-- Tabla para respaldar clientes de Shopify
CREATE TABLE IF NOT EXISTS shopify_customers_backup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_id BIGINT UNIQUE NOT NULL,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    tags TEXT,  -- Comma-separated tags
    accepts_marketing BOOLEAN DEFAULT FALSE,
    orders_count INTEGER DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0,
    state TEXT,  -- 'enabled', 'disabled', 'invited', 'declined'
    verified_email BOOLEAN DEFAULT FALSE,
    note TEXT,

    -- Address info
    address_company TEXT,
    address_address1 TEXT,
    address_address2 TEXT,
    address_city TEXT,
    address_province TEXT,
    address_country TEXT,
    address_zip TEXT,

    -- Timestamps from Shopify
    shopify_created_at TIMESTAMP WITH TIME ZONE,
    shopify_updated_at TIMESTAMP WITH TIME ZONE,

    -- Our timestamps
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_shopify_customers_email ON shopify_customers_backup(email);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_shopify_id ON shopify_customers_backup(shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_tags ON shopify_customers_backup USING gin(to_tsvector('simple', COALESCE(tags, '')));
CREATE INDEX IF NOT EXISTS idx_shopify_customers_synced ON shopify_customers_backup(synced_at);

-- Metadata table for sync status
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

-- Insert default metadata row
INSERT INTO shopify_sync_metadata (sync_type, status)
VALUES ('customers', 'idle')
ON CONFLICT (sync_type) DO NOTHING;

-- Comments
COMMENT ON TABLE shopify_customers_backup IS 'Backup of all Shopify customers for offline access and analytics';
COMMENT ON TABLE shopify_sync_metadata IS 'Tracks sync status and history for Shopify data';

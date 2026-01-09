-- Migration: Shopify App Sessions
-- Purpose: Store OAuth sessions and access tokens for the EUM Sales Agent Shopify App

-- Create table for storing Shopify app installations
CREATE TABLE IF NOT EXISTS shopify_app_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop TEXT UNIQUE NOT NULL,                    -- e.g., "extractoseum.myshopify.com"
    nonce TEXT,                                   -- OAuth state parameter
    access_token TEXT,                            -- Shopify access token (should be encrypted)
    scope TEXT,                                   -- Granted scopes
    status TEXT DEFAULT 'pending',                -- 'pending', 'active', 'uninstalled'
    installed_at TIMESTAMPTZ,
    uninstalled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ                        -- For pending sessions
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_shopify_app_sessions_shop ON shopify_app_sessions(shop);
CREATE INDEX IF NOT EXISTS idx_shopify_app_sessions_status ON shopify_app_sessions(status);

-- Add RLS policies
ALTER TABLE shopify_app_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (backend only)
CREATE POLICY shopify_app_sessions_service_policy ON shopify_app_sessions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_shopify_app_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_shopify_app_sessions_updated_at ON shopify_app_sessions;
CREATE TRIGGER trigger_shopify_app_sessions_updated_at
    BEFORE UPDATE ON shopify_app_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_shopify_app_sessions_updated_at();

-- Comment on table
COMMENT ON TABLE shopify_app_sessions IS 'Stores OAuth sessions and access tokens for the EUM Sales Agent Shopify App';

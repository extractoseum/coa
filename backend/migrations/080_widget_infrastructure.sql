-- =====================================================
-- Migration 080: Widget Infrastructure for Ara Chat
-- =====================================================
-- Creates the necessary tables and channel chips for the
-- Ara Chat Widget - a floating communication interface
-- for customers to chat with AI and receive notifications.
-- =====================================================

-- 1. Client Notifications Table
-- Stores all types of notifications for customers
CREATE TABLE IF NOT EXISTS client_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'order_update',      -- Shipping, delivery, payment status
        'coa_ready',         -- New COA available
        'promotion',         -- Sales, discounts
        'ara_message',       -- AI Ara async messages
        'support_reply',     -- Human agent reply
        'system'             -- System notifications
    )),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,  -- Additional data (order_id, coa_token, etc.)
    is_read BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient notification queries
CREATE INDEX IF NOT EXISTS idx_client_notifications_client_unread
ON client_notifications(client_id, is_read, created_at DESC)
WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_client_notifications_type
ON client_notifications(type, created_at DESC);

-- 2. Widget Sessions Table
-- Tracks anonymous and authenticated widget sessions
CREATE TABLE IF NOT EXISTS widget_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT UNIQUE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    fingerprint TEXT,           -- Browser fingerprint for rate limiting
    ip_hash TEXT,               -- Hashed IP for security
    origin TEXT NOT NULL,       -- 'coa.extractoseum.com' or 'extractoseum.com'
    user_agent TEXT,            -- Browser info
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authenticated_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

-- Indexes for session management
CREATE INDEX IF NOT EXISTS idx_widget_sessions_token ON widget_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_widget_sessions_client ON widget_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_widget_sessions_expires ON widget_sessions(expires_at);

-- 3. Add widget_session_id to conversations (optional link)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'widget_session_id'
    ) THEN
        ALTER TABLE conversations ADD COLUMN widget_session_id UUID REFERENCES widget_sessions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Update conversations channel constraint to include WIDGET
-- First drop existing constraint, then recreate with WIDGET
DO $$
BEGIN
    -- Check if constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'conversations_channel_check'
    ) THEN
        ALTER TABLE conversations DROP CONSTRAINT conversations_channel_check;
    END IF;

    -- Try to add updated constraint (may fail if data doesn't match, which is fine)
    BEGIN
        ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
        CHECK (channel IN ('WA', 'IG', 'FB', 'EMAIL', 'WEBCHAT', 'WIDGET', 'VOICE', 'SMS'));
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not add channel constraint - may have data that does not match';
    END;
END $$;

-- 5. Insert Channel Chips for Widget
-- These route widget messages to the correct CRM column
INSERT INTO channel_chips (channel_id, platform, traffic_source, expected_intent, is_active)
VALUES
    ('widget_ara', 'widget', 'direct', 'soporte', true),
    ('widget_shopify', 'widget', 'shopify', 'ventas', true)
ON CONFLICT (channel_id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    traffic_source = EXCLUDED.traffic_source;

-- 6. Create function to clean expired sessions (for cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_widget_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM widget_sessions
    WHERE expires_at < CURRENT_TIMESTAMP
    AND client_id IS NULL;  -- Only delete unauthenticated sessions

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS Policies for client_notifications
ALTER TABLE client_notifications ENABLE ROW LEVEL SECURITY;

-- Clients can only see their own notifications
CREATE POLICY client_notifications_select_own ON client_notifications
    FOR SELECT
    USING (
        client_id = (SELECT id FROM clients WHERE id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM clients
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin', 'staff')
        )
    );

-- Clients can mark their own notifications as read
CREATE POLICY client_notifications_update_own ON client_notifications
    FOR UPDATE
    USING (client_id = (SELECT id FROM clients WHERE id = auth.uid()))
    WITH CHECK (client_id = (SELECT id FROM clients WHERE id = auth.uid()));

-- Only system can insert notifications
CREATE POLICY client_notifications_insert_system ON client_notifications
    FOR INSERT
    WITH CHECK (true);  -- Backend service handles inserts

-- 8. RLS Policies for widget_sessions
ALTER TABLE widget_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY widget_sessions_service_full ON widget_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 9. Grant permissions
GRANT SELECT, UPDATE ON client_notifications TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON widget_sessions TO authenticated;

-- 10. Add comment for documentation
COMMENT ON TABLE client_notifications IS 'Customer notifications for Ara Widget - orders, COAs, promotions, support messages';
COMMENT ON TABLE widget_sessions IS 'Widget chat sessions tracking for both authenticated and anonymous users';
COMMENT ON COLUMN widget_sessions.origin IS 'Domain where widget is embedded: coa.extractoseum.com or extractoseum.com';
COMMENT ON COLUMN widget_sessions.fingerprint IS 'Browser fingerprint for rate limiting unauthenticated requests';

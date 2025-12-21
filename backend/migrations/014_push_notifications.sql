-- =====================================================
-- Migration: Push Notifications System
-- Date: 2025-12-17
-- Description: Tables for push notification management
-- =====================================================

-- 1. Push Tokens - Store device tokens for each user
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

    -- OneSignal specific
    onesignal_player_id TEXT NOT NULL,  -- OneSignal's user ID

    -- Device info
    platform TEXT CHECK (platform IN ('web', 'ios', 'android')),
    device_model TEXT,
    browser TEXT,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(onesignal_player_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_client ON push_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active);

-- 2. Push Notifications - History of sent notifications
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Content
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,  -- Additional payload (deep links, etc)
    image_url TEXT,  -- Optional image

    -- Targeting
    target_type TEXT CHECK (target_type IN ('all', 'tag', 'segment', 'individual', 'tier')),
    target_value TEXT,  -- Tag name, segment ID, client_id, or tier name

    -- Statistics (updated via OneSignal webhooks)
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,

    -- OneSignal tracking
    onesignal_notification_id TEXT,

    -- Scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE,  -- null = send immediately
    sent_at TIMESTAMP WITH TIME ZONE,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'failed', 'cancelled')),
    error_message TEXT,

    -- Metadata
    sent_by UUID REFERENCES clients(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_status ON push_notifications(status);
CREATE INDEX IF NOT EXISTS idx_push_notifications_sent_by ON push_notifications(sent_by);
CREATE INDEX IF NOT EXISTS idx_push_notifications_scheduled ON push_notifications(scheduled_for) WHERE status = 'scheduled';

-- 3. Notification Preferences - User preferences for notifications
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,

    -- Notification types (all default to true)
    notify_new_coa BOOLEAN DEFAULT TRUE,           -- When a COA is assigned
    notify_review_received BOOLEAN DEFAULT TRUE,    -- When someone reviews your COA
    notify_review_approved BOOLEAN DEFAULT TRUE,    -- When your review is approved
    notify_promotions BOOLEAN DEFAULT TRUE,         -- Marketing/promos
    notify_announcements BOOLEAN DEFAULT TRUE,      -- Important announcements

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_client ON notification_preferences(client_id);

-- 4. Add onesignal_player_id to clients table for quick lookups
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onesignal_player_id TEXT;

COMMENT ON TABLE push_tokens IS 'Device tokens for push notifications';
COMMENT ON TABLE push_notifications IS 'History of sent push notifications';
COMMENT ON TABLE notification_preferences IS 'User notification preferences';

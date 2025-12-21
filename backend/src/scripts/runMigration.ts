/**
 * Run migration script
 * Usage: npx ts-node src/scripts/runMigration.ts
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('Running push notifications migration...');
    console.log('Supabase URL:', supabaseUrl);

    try {
        // Test connection
        const { data: testData, error: testError } = await supabase
            .from('clients')
            .select('id')
            .limit(1);

        if (testError) {
            console.error('Connection test failed:', testError);
            return;
        }
        console.log('Connection successful. Running migrations...');

        // Note: We can't run raw SQL via supabase-js
        // The tables need to be created via Supabase Dashboard SQL Editor
        console.log('\n⚠️  Cannot run raw SQL via Supabase JS client.');
        console.log('Please run the following SQL in Supabase Dashboard SQL Editor:');
        console.log('https://supabase.com/dashboard/project/vbnpcospodhwuzvxejui/sql/new');
        console.log('\n--- SQL to run ---\n');

        const sql = `
-- 1. Push Tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    onesignal_player_id TEXT NOT NULL,
    platform TEXT CHECK (platform IN ('web', 'ios', 'android')),
    device_model TEXT,
    browser TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(onesignal_player_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_client ON push_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active);

-- 2. Push Notifications history table
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    image_url TEXT,
    target_type TEXT CHECK (target_type IN ('all', 'tag', 'segment', 'individual', 'tier')),
    target_value TEXT,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    onesignal_notification_id TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'failed', 'cancelled')),
    error_message TEXT,
    sent_by UUID REFERENCES clients(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_status ON push_notifications(status);
CREATE INDEX IF NOT EXISTS idx_push_notifications_sent_by ON push_notifications(sent_by);

-- 3. Notification Preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    notify_new_coa BOOLEAN DEFAULT TRUE,
    notify_review_received BOOLEAN DEFAULT TRUE,
    notify_review_approved BOOLEAN DEFAULT TRUE,
    notify_promotions BOOLEAN DEFAULT TRUE,
    notify_announcements BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_client ON notification_preferences(client_id);

-- 4. Add onesignal_player_id to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onesignal_player_id TEXT;
`;

        console.log(sql);
        console.log('\n--- End SQL ---\n');

    } catch (error) {
        console.error('Migration error:', error);
    }
}

runMigration();

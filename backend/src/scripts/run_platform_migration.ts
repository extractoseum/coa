/**
 * Run Platform Identifiers Migration
 * Adds Instagram, Facebook, Messenger, TikTok ID columns to clients table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runMigration() {
    console.log('=== Running Platform Identifiers Migration ===\n');

    // Check current columns
    const { data: sample } = await supabase.from('clients').select('*').limit(1);
    const currentColumns = Object.keys(sample?.[0] || {});

    console.log('Current columns count:', currentColumns.length);

    const newColumns = [
        'instagram_id',
        'instagram_username',
        'facebook_id',
        'messenger_id',
        'tiktok_id',
        'vambe_contact_id',
        'platform_metadata'
    ];

    const missing = newColumns.filter(c => !currentColumns.includes(c));

    if (missing.length === 0) {
        console.log('✅ All platform columns already exist!');
        console.log('Columns:', newColumns.join(', '));
        return;
    }

    console.log('Missing columns:', missing.join(', '));
    console.log('\n⚠️  To add these columns, run the following SQL in Supabase Dashboard:\n');

    // Generate SQL for missing columns
    const sqlStatements: string[] = [];

    if (missing.includes('instagram_id')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(255);");
    }
    if (missing.includes('instagram_username')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(255);");
    }
    if (missing.includes('facebook_id')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255);");
    }
    if (missing.includes('messenger_id')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS messenger_id VARCHAR(255);");
    }
    if (missing.includes('tiktok_id')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_id VARCHAR(255);");
    }
    if (missing.includes('vambe_contact_id')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS vambe_contact_id VARCHAR(255);");
    }
    if (missing.includes('platform_metadata')) {
        sqlStatements.push("ALTER TABLE clients ADD COLUMN IF NOT EXISTS platform_metadata JSONB DEFAULT '{}';");
    }

    // Add indexes
    sqlStatements.push("CREATE INDEX IF NOT EXISTS idx_clients_instagram_id ON clients(instagram_id) WHERE instagram_id IS NOT NULL;");
    sqlStatements.push("CREATE INDEX IF NOT EXISTS idx_clients_facebook_id ON clients(facebook_id) WHERE facebook_id IS NOT NULL;");
    sqlStatements.push("CREATE INDEX IF NOT EXISTS idx_clients_messenger_id ON clients(messenger_id) WHERE messenger_id IS NOT NULL;");
    sqlStatements.push("CREATE INDEX IF NOT EXISTS idx_clients_vambe_contact_id ON clients(vambe_contact_id) WHERE vambe_contact_id IS NOT NULL;");

    console.log('----------------------------------------');
    console.log(sqlStatements.join('\n'));
    console.log('----------------------------------------');

    console.log('\n📋 Copy the SQL above and run it in:');
    console.log('   https://supabase.com/dashboard/project/vbnpcospodhwuzvxejui/sql/new');
}

runMigration().catch(console.error);

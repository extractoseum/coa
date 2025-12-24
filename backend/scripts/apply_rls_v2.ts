
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Just the essential policies to fix Realtime
// We use raw SQL string to avoid file path issues
const SQL = `
-- Fix RLS for Realtime: Allow 'authenticated' (Admin) to SELECT rows

BEGIN;

-- 1. CONVERSATIONS
DROP POLICY IF EXISTS "Authenticated Read Access" ON conversations;
CREATE POLICY "Authenticated Read Access" ON conversations FOR SELECT TO authenticated USING (true);

-- 2. CRM_MESSAGES
DROP POLICY IF EXISTS "Authenticated Read Access" ON crm_messages;
CREATE POLICY "Authenticated Read Access" ON crm_messages FOR SELECT TO authenticated USING (true);

-- 3. CRM_CONTACT_SNAPSHOTS
ALTER TABLE crm_contact_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read Access" ON crm_contact_snapshots;
CREATE POLICY "Authenticated Read Access" ON crm_contact_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anon Read Access" ON crm_contact_snapshots;
CREATE POLICY "Anon Read Access" ON crm_contact_snapshots FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Service Role Full Access" ON crm_contact_snapshots;
CREATE POLICY "Service Role Full Access" ON crm_contact_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
`;

async function run() {
    console.log(`[RpcMigration] Applying RLS Fix via 'run_sql'...`);

    // Use 'run_sql' directly
    const { data, error } = await supabase.rpc('run_sql', { sql: SQL });

    if (error) {
        console.error('[RpcMigration] FAILED:', error);
        // Fallback: try separate queries if transaction fails? 
        // No, run_sql usually handles blocks.
    } else {
        console.log('[RpcMigration] SUCCESS! Migration applied.');
    }
}

run();

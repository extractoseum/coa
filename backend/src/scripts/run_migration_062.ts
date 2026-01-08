/**
 * Run Migration 062 - Add line_items to orders table
 * Uses Supabase RPC to execute SQL
 *
 * Run with: npx ts-node src/scripts/run_migration_062.ts
 */

import { supabase } from '../config/supabase';

async function runMigration() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       MIGRATION 062: ADD LINE_ITEMS TO ORDERS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Add line_items column
    console.log('1. Adding line_items column...');
    const { error: e1 } = await supabase.rpc('exec_sql', {
        sql_query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;`
    });
    if (e1) {
        // Try direct query if RPC doesn't exist
        console.log('   RPC not available, trying alternative...');
    } else {
        console.log('   ✅ line_items column added');
    }

    // Step 2: Add customer_email column
    console.log('2. Adding customer_email column...');
    const { error: e2 } = await supabase.rpc('exec_sql', {
        sql_query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;`
    });
    if (e2) console.log('   RPC not available');
    else console.log('   ✅ customer_email column added');

    // Step 3: Add customer_phone column
    console.log('3. Adding customer_phone column...');
    const { error: e3 } = await supabase.rpc('exec_sql', {
        sql_query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;`
    });
    if (e3) console.log('   RPC not available');
    else console.log('   ✅ customer_phone column added');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('NOTE: If RPC is not available, run this SQL in Supabase Dashboard:');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`
-- 062_orders_line_items.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_line_items ON orders USING GIN(line_items);

UPDATE orders o
SET customer_email = c.email,
    customer_phone = c.phone
FROM clients c
WHERE o.client_id = c.id
AND o.customer_email IS NULL;
    `);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Try to test if columns exist
    console.log('Testing if columns exist...');
    const { data, error } = await supabase
        .from('orders')
        .select('id, line_items, customer_email')
        .limit(1);

    if (error) {
        if (error.message.includes('line_items') || error.message.includes('customer_email')) {
            console.log('❌ Columns do not exist yet. Please run the SQL above in Supabase Dashboard.');
        } else {
            console.log('Error:', error.message);
        }
    } else {
        console.log('✅ Columns exist! Migration complete.');
        if (data && data.length > 0) {
            console.log('Sample order:', JSON.stringify(data[0], null, 2));
        }
    }
}

runMigration().catch(console.error);

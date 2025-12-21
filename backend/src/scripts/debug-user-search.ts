
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    const phoneNumber = '3327177432';
    console.log(`Searching for phone containing: ${phoneNumber}`);

    // 1. Broad search
    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .ilike('phone', `%${phoneNumber}%`);

    if (error) {
        console.error('Error searching clients:', error);
        return;
    }

    console.log(`Found ${clients.length} matching clients:`);
    clients.forEach(c => {
        console.log(`- ID: ${c.id}`);
        console.log(`  Name: ${c.name}`);
        console.log(`  Email: ${c.email}`);
        console.log(`  Phone: '${c.phone}'`); // Quote to see whitespace
        console.log(`  Active: ${c.is_active}`);
        console.log(`  ShopifyID: ${c.shopify_customer_id}`);
        console.log('---');
    });

    // 2. Check for duplicate created recently
    const { data: recent } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\nMost recent 5 clients:');
    recent?.forEach(c => {
        console.log(`- ID: ${c.id}`);
        console.log(`  Name: ${c.name}`);
        console.log(`  Email: ${c.email}`);
        console.log(`  Phone: '${c.phone}'`);
        console.log(`  Created: ${c.created_at}`);
        console.log('---');
    });
}

checkUser();

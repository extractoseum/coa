
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

async function deepSearch() {
    const targetPhone = '3327177432';
    const duplicateId = 'fda995b5-f1a6-4d5d-9b9f-b7e460913809'; // ID found in previous step

    console.log(`Deep searching for: ${targetPhone}`);

    // 1. Search Shopify
    console.log('\n--- Shopify Search ---');
    try {
        const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/search.json?query=phone:${targetPhone}&fields=id,email,phone,first_name,last_name`;
        const res = await axios.get(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } });
        const shopifyCustomers = res.data.customers;
        console.log(`Found ${shopifyCustomers.length} Shopify customers:`);
        console.log(JSON.stringify(shopifyCustomers, null, 2));
    } catch (err: any) {
        console.error('Shopify search error:', err.message);
    }

    // 2. Scan All Local Clients
    console.log('\n--- Local DB Scan ---');
    const { data: allClients, error } = await supabase.from('clients').select('id, name, email, phone');
    if (error) {
        console.error('DB Error:', error);
    } else {
        const matches = allClients.filter(c => {
            if (!c.phone) return false;
            const digits = c.phone.replace(/\D/g, '');
            return digits.includes(targetPhone);
        });

        console.log(`Found ${matches.length} matching local clients (fuzzy check):`);
        matches.forEach(c => {
            console.log(`- ID: ${c.id}`);
            console.log(`  Name: ${c.name}`);
            console.log(`  Email: ${c.email}`);
            console.log(`  Phone: '${c.phone}'`);
            if (c.id === duplicateId) console.log('  (THIS IS THE DUPLICATE)');
            console.log('---');
        });
    }

    // 3. Delete Duplicate
    console.log('\n--- Cleanup ---');
    console.log(`Deleting duplicate user: ${duplicateId}`);
    const { error: delError } = await supabase.from('clients').delete().eq('id', duplicateId);
    if (delError) console.error('Delete failed:', delError);
    else console.log('Duplicate deleted successfully.');

}

deepSearch();

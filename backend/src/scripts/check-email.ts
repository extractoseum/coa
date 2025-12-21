
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmail() {
    const email = 'bdelatorre88@hotmail.com';
    console.log(`Searching for email: ${email}`);

    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .ilike('email', email);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${clients.length} matching clients:`);
        clients.forEach(c => {
            console.log(`- ID: ${c.id}`);
            console.log(`  Name: ${c.name}`);
            console.log(`  Email: ${c.email}`);
            console.log(`  Phone: '${c.phone}'`);
            console.log(`  ShopifyID: ${c.shopify_customer_id}`);
        });
    }
}

checkEmail();

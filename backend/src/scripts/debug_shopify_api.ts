
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import axios from 'axios';
import { supabase } from '../config/supabase';

// Manual setup
const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const VERSION = '2024-01';

async function syncAndFix() {
    console.log('--- Config ---');
    console.log(`Domain: ${DOMAIN}`);

    if (!DOMAIN || !TOKEN) {
        console.error('Missing credentials in .env');
        return;
    }

    const email = 'bdelatorre8@gmail.com';
    console.log(`\n--- Fetching Customer ${email} ---`);

    const searchUrl = `https://${DOMAIN}/admin/api/${VERSION}/customers/search.json?query=email:${email}`;

    try {
        const searchRes = await axios.get(searchUrl, {
            headers: { 'X-Shopify-Access-Token': TOKEN }
        });

        const customers = searchRes.data.customers;
        if (!customers || customers.length === 0) {
            console.error('Customer not found in Shopify.');
            return;
        }

        const c = customers[0];
        console.log(`ID: ${c.id}, Orders: ${c.orders_count}, Spent: ${c.total_spent}`);

        // Fetch Orders
        const ordersUrl = `https://${DOMAIN}/admin/api/${VERSION}/customers/${c.id}/orders.json?status=any`;
        const ordersRes = await axios.get(ordersUrl, {
            headers: { 'X-Shopify-Access-Token': TOKEN }
        });

        console.log(`Found ${ordersRes.data.orders.length} orders.`);

        // --- SYNC START ---
        console.log('--- Syncing Orders to DB ---');

        const { data: dbClient } = await supabase.from('clients').select('id').eq('email', email).single();
        if (!dbClient) {
            console.error('Client not found in DB local.');
            return;
        }

        let savedCount = 0;
        const orders = ordersRes.data.orders;

        for (const order of orders) {
            const { error } = await supabase
                .from('orders')
                .upsert({
                    client_id: dbClient.id,
                    shopify_order_id: order.id.toString(),
                    order_number: order.name,
                    status: order.financial_status === 'paid' ? 'paid' : 'created',
                    total_amount: order.total_price,
                    currency: order.currency,
                    shopify_created_at: order.created_at,
                    shopify_updated_at: order.updated_at
                }, { onConflict: 'shopify_order_id' });

            if (error) console.error(`Failed to save ${order.name}:`, error.message);
            else savedCount++;
        }
        console.log(`Saved ${savedCount} orders.`);

        // Update client stats
        const tags = c.tags ? c.tags.split(',').map((t: any) => t.trim()) : [];
        console.log('Updating Client tags:', tags);

        const { error: updateError } = await supabase
            .from('clients')
            .update({
                orders_count: c.orders_count,
                total_spent: c.total_spent,
                ltv: c.total_spent,
                tags: tags
            })
            .eq('id', dbClient.id);

        if (updateError) console.error('Stats Update Error:', updateError.message);
        else console.log('Client stats/tags updated successfully.');
        // --- SYNC END ---

    } catch (error: any) {
        console.error('Request Failed:', error.message);
        if (error.response) console.error(JSON.stringify(error.response.data));
    }
}

syncAndFix();

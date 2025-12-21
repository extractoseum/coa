
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';
import axios from 'axios';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const API_VERSION = '2024-01';

async function syncV2() {
    console.log('[Sync V2] Starting...');
    if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
        console.error('Missing env vars');
        return;
    }

    const email = 'bdelatorre8@gmail.com';
    const baseUrl = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}`;

    // 1. Get Client locally
    const { data: client } = await supabase.from('clients').select('*').eq('email', email).single();
    if (!client) {
        console.error('Client not found in DB');
        return;
    }

    try {
        // 2. Search Customer in Shopify
        console.log(`[Sync V2] Searching Shopify for ${email}...`);
        const searchRes = await axios.get(`${baseUrl}/customers/search.json?query=email:${email}`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
        });

        const customer = searchRes.data.customers?.[0];
        if (!customer) {
            console.error('Customer not found in Shopify');
            return;
        }

        console.log(`[Sync V2] Found Customer ID: ${customer.id}`);

        // 3. Fetch Orders
        console.log('[Sync V2] Fetching Orders...');
        const ordersRes = await axios.get(`${baseUrl}/customers/${customer.id}/orders.json?status=any`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
        });

        const orders = ordersRes.data.orders || [];
        console.log(`[Sync V2] Found ${orders.length} orders.`);

        // 4. Save Orders
        let saved = 0;
        for (const order of orders) {
            const { error } = await supabase
                .from('orders')
                .upsert({
                    client_id: client.id,
                    shopify_order_id: order.id.toString(),
                    order_number: order.name,
                    status: order.financial_status === 'paid' ? 'paid' : 'created',
                    total_amount: order.total_price,
                    currency: order.currency,
                    shopify_created_at: order.created_at,
                    shopify_updated_at: order.updated_at
                }, { onConflict: 'shopify_order_id' });

            if (error) console.error(`Failed to save ${order.name}:`, error.message);
            else saved++;
        }
        console.log(`[Sync V2] Saved ${saved} orders locally.`);

        // 5. Update Client Stats and Tags
        const tags = customer.tags ? customer.tags.split(',').map((t: string) => t.trim()) : [];
        const { error: updateError } = await supabase
            .from('clients')
            .update({
                orders_count: customer.orders_count,
                total_spent: customer.total_spent,
                ltv: customer.total_spent,
                tags: tags // Sync tags as well just in case
            })
            .eq('id', client.id);

        if (updateError) console.error('Failed to update client stats:', updateError.message);
        else console.log('[Sync V2] Client stats and tags updated.');

    } catch (e: any) {
        console.error('Sync failed:', e.message);
        if (e.response) {
            console.error('Response:', JSON.stringify(e.response.data));
        }
    }
}

syncV2();

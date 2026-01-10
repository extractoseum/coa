/**
 * Check delta's orders in Shopify vs our DB
 */
import 'dotenv/config';
import { supabase } from '../config/supabase';
import axios from 'axios';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

async function checkDeltaShopify() {
    // Get delta's orders from our DB
    const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, shopify_order_id, status, financial_status, fulfillment_status')
        .eq('client_id', '9eb92a90-164e-48d3-a57b-346c38c00c62')
        .order('created_at', { ascending: false });

    console.log('=== COMPARING DB vs SHOPIFY ===\n');

    for (const order of orders || []) {
        if (!order.shopify_order_id) continue;

        try {
            const response = await axios.get(
                `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders/${order.shopify_order_id}.json`,
                { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
            );

            const shopifyOrder = response.data.order;

            console.log(`${order.order_number}:`);
            console.log(`  DB:      financial=${order.financial_status}, fulfillment=${order.fulfillment_status}`);
            console.log(`  Shopify: financial=${shopifyOrder.financial_status}, fulfillment=${shopifyOrder.fulfillment_status}`);

            if (order.financial_status !== shopifyOrder.financial_status ||
                order.fulfillment_status !== shopifyOrder.fulfillment_status) {
                console.log(`  ⚠️  MISMATCH!`);
            } else {
                console.log(`  ✓ Match`);
            }
            console.log('');

            // Rate limit
            await new Promise(r => setTimeout(r, 200));
        } catch (err: any) {
            console.log(`${order.order_number}: Error - ${err.response?.status || err.message}`);
        }
    }
}

checkDeltaShopify().then(() => process.exit(0));

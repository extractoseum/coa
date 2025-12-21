
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { getShopifyOrderById } from '../services/shopifyService';
import { supabase } from '../config/supabase';

async function testFetch() {
    console.log('--- Debug Order Fetch ---');

    // 1. Get an order ID from DB
    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

    if (!orders || orders.length === 0) {
        console.log('No orders in DB to test with.');
        return;
    }

    const testOrder = orders[0];
    console.log('Testing with Order:', testOrder.order_number);
    console.log('Shopify ID from DB:', testOrder.shopify_order_id);

    try {
        console.log('Fetching from ShopifyService...');
        const shopifyData = await getShopifyOrderById(testOrder.shopify_order_id);

        if (shopifyData) {
            console.log('SUCCESS! Got data from Shopify.');
            console.log('Keys:', Object.keys(shopifyData));
            console.log('Line Items:', shopifyData.line_items?.length);
        } else {
            console.error('FAILURE. Shopify returned null.');
        }

    } catch (e: any) {
        console.error('EXCEPTION:', e.message);
    }
}

testFetch();

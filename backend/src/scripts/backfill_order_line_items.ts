/**
 * Backfill Order Line Items
 *
 * This script fetches line_items from Shopify for existing orders
 * that don't have line_items data yet.
 *
 * Run with: npx ts-node src/scripts/backfill_order_line_items.ts
 */

import { supabase } from '../config/supabase';
import { getShopifyOrderById } from '../services/shopifyService';

async function backfillLineItems() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       BACKFILL ORDER LINE ITEMS FOR ORACLE');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Find orders without line_items or with empty line_items
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, shopify_order_id, order_number, customer_email, line_items')
        .or('line_items.is.null,line_items.eq.[]')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('❌ Error fetching orders:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders to backfill\n`);

    if (!orders || orders.length === 0) {
        console.log('✅ All orders already have line_items data!');
        return;
    }

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const order of orders) {
        console.log(`Processing ${order.order_number} (Shopify ID: ${order.shopify_order_id})...`);

        try {
            const shopifyOrder = await getShopifyOrderById(order.shopify_order_id);

            if (!shopifyOrder) {
                console.log(`  ⚠️ Could not fetch from Shopify, skipping`);
                skipped++;
                continue;
            }

            if (!shopifyOrder.line_items || shopifyOrder.line_items.length === 0) {
                console.log(`  ⚠️ No line_items in Shopify order, skipping`);
                skipped++;
                continue;
            }

            // Extract line_items
            const lineItems = shopifyOrder.line_items.map((item: any) => ({
                product_id: item.product_id?.toString(),
                variant_id: item.variant_id?.toString(),
                title: item.title || item.name,
                quantity: item.quantity,
                price: item.price
            }));

            // Update order
            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    line_items: lineItems,
                    customer_email: order.customer_email || shopifyOrder.email || shopifyOrder.customer?.email,
                    customer_phone: shopifyOrder.customer?.phone || shopifyOrder.customer?.default_address?.phone || null
                })
                .eq('id', order.id);

            if (updateError) {
                console.log(`  ❌ Error updating: ${updateError.message}`);
                failed++;
            } else {
                console.log(`  ✅ Updated with ${lineItems.length} line items`);
                success++;
            }

            // Rate limiting - Shopify has 40 calls/second limit
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (err: any) {
            console.log(`  ❌ Error: ${err.message}`);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    BACKFILL COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Success: ${success}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Skipped: ${skipped}`);
    console.log('═══════════════════════════════════════════════════════════\n');
}

backfillLineItems().catch(console.error);

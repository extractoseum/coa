/**
 * Sync orders that are missing financial_status or fulfillment_status
 * Fetches current data from Shopify and updates local DB
 */
import 'dotenv/config';
import { supabase } from '../config/supabase';
import axios from 'axios';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

async function syncMissingStatus() {
    console.log('=== Syncing orders with missing status fields ===\n');

    // Find orders missing financial_status or fulfillment_status
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_number, shopify_order_id, status, financial_status, fulfillment_status')
        .or('financial_status.is.null,fulfillment_status.is.null')
        .not('shopify_order_id', 'is', null)
        .order('shopify_created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders?.length || 0} orders with missing status\n`);

    let updated = 0;
    let trackingAdded = 0;

    for (const order of orders || []) {
        try {
            // Fetch from Shopify
            const response = await axios.get(
                `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders/${order.shopify_order_id}.json`,
                { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
            );

            const shopifyOrder = response.data.order;

            console.log(`${order.order_number}: financial=${shopifyOrder.financial_status}, fulfillment=${shopifyOrder.fulfillment_status}, fulfillments=${shopifyOrder.fulfillments?.length || 0}`);

            // Update order
            const newStatus = shopifyOrder.fulfillment_status === 'fulfilled' ? 'fulfilled' :
                             shopifyOrder.financial_status === 'paid' ? 'paid' : 'created';

            await supabase
                .from('orders')
                .update({
                    financial_status: shopifyOrder.financial_status,
                    fulfillment_status: shopifyOrder.fulfillment_status,
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', order.id);

            updated++;

            // Add tracking if fulfillments exist
            if (shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0) {
                for (const fulfillment of shopifyOrder.fulfillments) {
                    const trackingNumbers = fulfillment.tracking_numbers || [];
                    const trackingUrls = fulfillment.tracking_urls || [];
                    const carrier = fulfillment.tracking_company || 'Unknown';

                    for (let i = 0; i < trackingNumbers.length; i++) {
                        const trackingNumber = trackingNumbers[i];
                        // Skip URLs that got put in tracking_numbers
                        if (trackingNumber.startsWith('http')) continue;

                        const trackingUrl = trackingUrls[i] || null;

                        // Check if tracking already exists
                        const { data: existing } = await supabase
                            .from('order_tracking')
                            .select('id')
                            .eq('order_id', order.id)
                            .eq('tracking_number', trackingNumber)
                            .single();

                        if (!existing) {
                            const { error: insertError } = await supabase
                                .from('order_tracking')
                                .insert({
                                    order_id: order.id,
                                    carrier: carrier,
                                    tracking_number: trackingNumber,
                                    tracking_url: trackingUrl,
                                    current_status: 'pending'
                                });

                            if (!insertError) {
                                console.log(`  + Added tracking: ${carrier} ${trackingNumber}`);
                                trackingAdded++;
                            }
                        }
                    }
                }
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 200));

        } catch (err: any) {
            console.error(`  Error syncing ${order.order_number}:`, err.response?.status || err.message);
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Orders updated: ${updated}`);
    console.log(`Tracking records added: ${trackingAdded}`);
}

syncMissingStatus().then(() => process.exit(0));

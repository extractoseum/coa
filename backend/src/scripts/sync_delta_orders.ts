/**
 * Sync delta's orders that have missing status
 */
import 'dotenv/config';
import { supabase } from '../config/supabase';
import axios from 'axios';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

async function syncDeltaOrders() {
    // Get delta's orders with missing status
    const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, shopify_order_id, status, financial_status, fulfillment_status')
        .eq('client_id', '9eb92a90-164e-48d3-a57b-346c38c00c62')
        .or('financial_status.is.null,fulfillment_status.is.null');

    console.log(`Found ${orders?.length || 0} orders to sync\n`);

    for (const order of orders || []) {
        if (!order.shopify_order_id) continue;

        try {
            const response = await axios.get(
                `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders/${order.shopify_order_id}.json`,
                { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
            );

            const shopifyOrder = response.data.order;

            // Determine new status
            const newStatus = shopifyOrder.cancelled_at ? 'cancelled' :
                shopifyOrder.fulfillment_status === 'fulfilled' ? 'fulfilled' :
                shopifyOrder.financial_status === 'paid' ? 'paid' : 'created';

            // Update order
            const { error } = await supabase
                .from('orders')
                .update({
                    financial_status: shopifyOrder.financial_status,
                    fulfillment_status: shopifyOrder.fulfillment_status,
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', order.id);

            if (error) {
                console.log(`❌ ${order.order_number}: ${error.message}`);
            } else {
                console.log(`✅ ${order.order_number}: financial=${shopifyOrder.financial_status}, fulfillment=${shopifyOrder.fulfillment_status}`);
            }

            // Add tracking if fulfillments exist
            if (shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0) {
                for (const fulfillment of shopifyOrder.fulfillments) {
                    const trackingNumbers = fulfillment.tracking_numbers || [];
                    const trackingUrls = fulfillment.tracking_urls || [];
                    const carrier = fulfillment.tracking_company || 'Unknown';

                    for (let i = 0; i < trackingNumbers.length; i++) {
                        const trackingNumber = trackingNumbers[i];
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
                            }
                        }
                    }
                }
            }

            await new Promise(r => setTimeout(r, 200));
        } catch (err: any) {
            console.log(`❌ ${order.order_number}: ${err.response?.status || err.message}`);
        }
    }
}

syncDeltaOrders().then(() => process.exit(0));

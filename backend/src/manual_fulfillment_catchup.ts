import { supabase } from './config/supabase';
import { getShopifyOrderById } from './services/shopifyService';
import { notifyOrderShipped } from './services/onesignalService';
import axios from 'axios';

async function syncAndNotifyFulfillment(orderNumber: string) {
    console.log(`--- Syncing Fulfillment for ${orderNumber} ---`);

    // 1. Find order in Shopify to get its ID
    // Note: We need the numeric Shopify Order ID. EUM_1377_SHOP is the name.
    // In our DB we might have it now if the simulation ran.
    let { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .single();

    if (!order) {
        console.error('Order not found in DB. Please run simulate_order_1377.ts first.');
        return;
    }

    const shopifyOrderId = order.shopify_order_id;
    console.log(`Found order in DB. Shopify Order ID: ${shopifyOrderId}`);

    // 2. Fetch Fulfillments from Shopify
    const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

    try {
        const response = await axios.get(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders/${shopifyOrderId}/fulfillments.json`,
            {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
            }
        );

        const fulfillments = response.data.fulfillments;
        console.log(`Found ${fulfillments.length} fulfillments in Shopify.`);

        if (fulfillments.length > 0) {
            const f = fulfillments[0];
            const trackingNumber = f.tracking_number;
            const carrier = f.tracking_company || 'Estafeta';
            const trackingUrl = f.tracking_url;

            console.log(`Processing fulfillment: ${trackingNumber} (${carrier})`);

            // 3. Update DB
            await supabase
                .from('orders')
                .update({ status: 'fulfilled', updated_at: new Date().toISOString() })
                .eq('id', order.id);

            await supabase
                .from('order_tracking')
                .upsert({
                    order_id: order.id,
                    carrier: carrier,
                    tracking_number: trackingNumber,
                    tracking_url: trackingUrl,
                    current_status: 'in_transit',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'order_id' });

            // 4. Trigger Notification
            console.log('Triggering notifyOrderShipped...');
            await notifyOrderShipped(order.client_id, order.order_number, carrier, trackingNumber);
            console.log('Success!');
        } else {
            console.warn('No fulfillments found for this order in Shopify.');
        }

    } catch (error: any) {
        console.error('Error fetching fulfillments:', error.response?.data || error.message);
    }
}

syncAndNotifyFulfillment('EUM_1377_SHOP');

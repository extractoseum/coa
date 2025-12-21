import { supabase } from './config/supabase';
import * as webhookController from './controllers/webhookController';
import axios from 'axios';

async function syncRecentOrders() {
    console.log('--- Syncing Recent Orders from Shopify ---');

    const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
        console.error('Missing Shopify credentials in environment');
        return;
    }

    try {
        // 1. Fetch last 50 orders from Shopify
        console.log(`Fetching orders from https://${SHOPIFY_STORE_DOMAIN}...`);
        const response = await axios.get(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=50&status=any`,
            {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
            }
        );

        const orders = response.data.orders;
        console.log(`Found ${orders.length} orders.`);

        // 2. Process each order through our webhook logic
        for (const order of orders) {
            console.log(`\n--- Processing order: ${order.name} (${order.id}) ---`);

            // MOCK Request/Response for the internal handler
            const req = { body: order } as any;
            const res = {
                status: (code: number) => ({
                    json: (data: any) => console.log(`Result [${code}]:`, data)
                })
            } as any;

            await webhookController.handleOrderUpdate(req, res);

            // Also check if it's fulfilled to sync fulfillment
            if (order.fulfillment_status === 'fulfilled' || (order.fulfillments && order.fulfillments.length > 0)) {
                console.log(`Order ${order.name} is fulfilled. Processing fulfillment...`);
                // Shopify sends multiple fulfillments if there are multiple shipments
                const fulfillments = order.fulfillments || [];
                for (const f of fulfillments) {
                    // Enrich fulfillment with order_id for handleFulfillmentUpdate
                    const fulfillmentPayload = {
                        ...f,
                        order_id: order.id
                    };
                    const freq = { body: fulfillmentPayload } as any;
                    await webhookController.handleFulfillmentUpdate(freq, res);
                }
            }
        }

        console.log('\n--- Sync Complete ---');
    } catch (error: any) {
        console.error('Error syncing orders:', error.response?.data || error.message);
    }
}

syncRecentOrders();

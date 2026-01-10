/**
 * Re-sync a specific order from Shopify
 * Usage: npx ts-node src/scripts/resync_order.ts EUM1001_SHOP
 */
import { supabase } from '../config/supabase';
import axios from 'axios';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

async function resyncOrder(orderNumber: string) {
    console.log(`\n=== Re-syncing order ${orderNumber} ===\n`);

    // 1. Get order from our DB
    const { data: localOrder, error: localError } = await supabase
        .from('orders')
        .select('*, order_tracking(*)')
        .ilike('order_number', `%${orderNumber}%`)
        .single();

    if (!localOrder) {
        console.log(`Order ${orderNumber} not found in local DB`);
        return;
    }

    console.log('Local order:', {
        id: localOrder.id,
        order_number: localOrder.order_number,
        shopify_order_id: localOrder.shopify_order_id,
        status: localOrder.status,
        financial_status: localOrder.financial_status,
        fulfillment_status: localOrder.fulfillment_status,
        tracking_count: localOrder.order_tracking?.length || 0
    });

    // 2. Fetch order from Shopify
    try {
        const shopifyResponse = await axios.get(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders/${localOrder.shopify_order_id}.json`,
            { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
        );

        const shopifyOrder = shopifyResponse.data.order;

        console.log('\nShopify order:', {
            name: shopifyOrder.name,
            financial_status: shopifyOrder.financial_status,
            fulfillment_status: shopifyOrder.fulfillment_status,
            fulfillments_count: shopifyOrder.fulfillments?.length || 0
        });

        // 3. Update local order with Shopify data
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                financial_status: shopifyOrder.financial_status,
                fulfillment_status: shopifyOrder.fulfillment_status,
                status: shopifyOrder.fulfillment_status === 'fulfilled' ? 'fulfilled' :
                        shopifyOrder.financial_status === 'paid' ? 'paid' : 'created',
                updated_at: new Date().toISOString()
            })
            .eq('id', localOrder.id);

        if (updateError) {
            console.error('Failed to update order:', updateError);
        } else {
            console.log('\n✅ Updated order status fields');
        }

        // 4. Process fulfillments to create tracking records
        if (shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0) {
            console.log(`\nProcessing ${shopifyOrder.fulfillments.length} fulfillments...`);

            for (const fulfillment of shopifyOrder.fulfillments) {
                const trackingNumbers = fulfillment.tracking_numbers || [];
                const trackingUrls = fulfillment.tracking_urls || [];
                const carrier = fulfillment.tracking_company || 'Unknown';

                for (let i = 0; i < trackingNumbers.length; i++) {
                    const trackingNumber = trackingNumbers[i];
                    const trackingUrl = trackingUrls[i] || null;

                    console.log(`  - Upserting tracking: ${carrier} ${trackingNumber}`);

                    const { error: trackingError } = await supabase
                        .from('order_tracking')
                        .upsert({
                            order_id: localOrder.id,
                            carrier: carrier,
                            tracking_number: trackingNumber,
                            tracking_url: trackingUrl,
                            current_status: 'pending', // Will be updated by tracking service
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'order_id,tracking_number' });

                    if (trackingError) {
                        console.error(`    Failed to upsert tracking:`, trackingError.message);
                    } else {
                        console.log(`    ✅ Tracking upserted`);
                    }
                }
            }
        } else {
            console.log('\nNo fulfillments found in Shopify');
        }

        // 5. Verify final state
        const { data: finalOrder } = await supabase
            .from('orders')
            .select('*, order_tracking(*)')
            .eq('id', localOrder.id)
            .single();

        console.log('\n=== Final state ===');
        console.log({
            order_number: finalOrder?.order_number,
            status: finalOrder?.status,
            financial_status: finalOrder?.financial_status,
            fulfillment_status: finalOrder?.fulfillment_status,
            tracking: finalOrder?.order_tracking?.map((t: any) => ({
                carrier: t.carrier,
                number: t.tracking_number,
                status: t.current_status
            }))
        });

    } catch (error: any) {
        console.error('Error fetching from Shopify:', error.response?.data || error.message);
    }
}

// Get order number from command line
const orderNumber = process.argv[2] || 'EUM1001_SHOP';
resyncOrder(orderNumber).then(() => process.exit(0));

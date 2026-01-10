import { supabase } from '../config/supabase';

async function checkAllLogs() {
    // Check if webhook_logs table has any data
    const { count } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true });

    console.log(`Total webhook_logs: ${count}`);

    // Get most recent 10 logs of any type
    const { data: recentLogs } = await supabase
        .from('webhook_logs')
        .select('event_type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('\n=== Most recent webhook logs ===');
    recentLogs?.forEach(log => {
        console.log(`  ${log.created_at} - ${log.event_type}`);
    });

    // Check Shopify webhook configuration
    // This requires checking if webhooks are registered in Shopify admin
    console.log('\n=== Expected Shopify Webhook Endpoints ===');
    console.log('  orders/create -> /api/v1/webhooks/shopify/order-create');
    console.log('  orders/updated -> /api/v1/webhooks/shopify/order-updated');
    console.log('  fulfillments/create -> /api/v1/webhooks/shopify/fulfillment-update');
    console.log('  fulfillments/update -> /api/v1/webhooks/shopify/fulfillment-update');
    console.log('  customers/update -> /api/v1/webhooks/shopify/customer-update');
    console.log('  checkouts/update -> /api/v1/webhooks/shopify/checkout-update');

    // Check order_tracking table
    const { count: trackingCount } = await supabase
        .from('order_tracking')
        .select('*', { count: 'exact', head: true });

    console.log(`\nTotal order_tracking records: ${trackingCount}`);

    // Recent tracking records
    const { data: recentTracking } = await supabase
        .from('order_tracking')
        .select('tracking_number, carrier, current_status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\n=== Most recent tracking records ===');
    recentTracking?.forEach(t => {
        console.log(`  ${t.created_at} - ${t.carrier} ${t.tracking_number} (${t.current_status})`);
    });
}

checkAllLogs().then(() => process.exit(0));

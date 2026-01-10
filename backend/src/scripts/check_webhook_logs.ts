import { supabase } from '../config/supabase';

async function checkLogs() {
    // Check recent fulfillment webhooks
    const { data: fulfillmentLogs, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('event_type', 'shopify_fulfillment_update_raw')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('=== Recent Fulfillment Webhooks ===');
    if (fulfillmentLogs) {
        for (const log of fulfillmentLogs) {
            const payload = log.payload as any;
            console.log(`\n${log.created_at}:`);
            console.log(`  Order ID: ${payload?.order_id}`);
            console.log(`  Tracking: ${payload?.tracking_numbers || payload?.tracking_number}`);
            console.log(`  Carrier: ${payload?.tracking_company}`);
        }
    }

    // Check if there's a log for EUM1001_SHOP's shopify_order_id
    const shopifyOrderId = '6796252676268'; // From previous query

    const { data: orderLogs } = await supabase
        .from('webhook_logs')
        .select('event_type, created_at, payload')
        .or(`payload->>order_id.eq.${shopifyOrderId},payload->>id.eq.${shopifyOrderId}`)
        .order('created_at', { ascending: false })
        .limit(20);

    console.log('\n\n=== Logs for EUM1001_SHOP (6796252676268) ===');
    if (orderLogs && orderLogs.length > 0) {
        for (const log of orderLogs) {
            console.log(`\n${log.created_at} - ${log.event_type}`);
        }
    } else {
        console.log('No webhook logs found for this order!');
    }

    // Count total webhook logs by type
    const { data: counts } = await supabase
        .from('webhook_logs')
        .select('event_type')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const typeCounts: Record<string, number> = {};
    counts?.forEach(log => {
        typeCounts[log.event_type] = (typeCounts[log.event_type] || 0) + 1;
    });

    console.log('\n\n=== Webhook counts (last 7 days) ===');
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
    });
}

checkLogs().then(() => process.exit(0));

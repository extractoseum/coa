import { supabase } from './config/supabase';

async function checkOrderLogs() {
    console.log('Searching for logs related to EUM_1399_SHOP...');

    // Check system_logs for the order number in the payload
    const { data: logs, error: logsError } = await supabase
        .from('system_logs')
        .select('*')
        .or('payload->>order_number.eq.EUM_1399_SHOP,payload->>order_id.eq.EUM_1399_SHOP')
        .order('created_at', { ascending: false });

    if (logsError) {
        console.error('Error fetching logs:', logsError);
    } else {
        console.log('Found logs:', JSON.stringify(logs, null, 2));
    }

    // Also search in general webhook logs
    const { data: webhookLogs, error: webhookError } = await supabase
        .from('system_logs')
        .select('*')
        .eq('event_type', 'shopify_webhook_received')
        .order('created_at', { ascending: false })
        .limit(20);

    if (webhookError) {
        console.error('Error fetching webhook logs:', webhookError);
    } else {
        console.log('Recent webhook logs:', JSON.stringify(webhookLogs, null, 2));
    }
}

checkOrderLogs();

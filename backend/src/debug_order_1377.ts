import { supabase } from './config/supabase';

async function debugOrder() {
    const orderNumber = 'EUM_1377_SHOP';
    const clientEmail = 'erick@necte.mx';

    console.log(`--- Debugging Order ${orderNumber} ---`);

    // 1. Check client
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('email', clientEmail)
        .single();

    if (clientError) {
        console.error('Client not found:', clientError.message);
    } else {
        console.log('Client found:', {
            id: client.id,
            email: client.email,
            shopify_customer_id: client.shopify_customer_id,
            onesignal_player_id: client.onesignal_player_id
        });
    }

    // 2. Check logs for this order
    const { data: logs, error: logsError } = await supabase
        .from('system_logs')
        .select('*')
        .or(`payload->>order_number.eq.${orderNumber},payload->>name.eq.${orderNumber}`)
        .order('created_at', { ascending: false });

    if (logsError) {
        console.error('Error fetching logs:', logsError.message);
    } else {
        console.log(`Found ${logs.length} logs for order ${orderNumber}`);
        logs.forEach(log => {
            console.log(`[${log.created_at}] ${log.event_type}: ${JSON.stringify(log.payload).substring(0, 100)}...`);
        });
    }

    // 3. Check for any webhook logs in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentWebhookLogs } = await supabase
        .from('system_logs')
        .select('event_type, created_at')
        .eq('category', 'webhook')
        .gt('created_at', oneHourAgo);

    console.log('Recent webhook events:', recentWebhookLogs?.map(l => l.event_type));
}

debugOrder();

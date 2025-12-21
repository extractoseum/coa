import { supabase } from './config/supabase';

async function debugOrderDetailed() {
    const orderNumber = 'EUM_1377_SHOP';
    const clientEmail = 'erick@necte.mx';

    console.log(`--- Detailed Debugging for ${orderNumber} ---`);

    // 1. Get the log entry
    const { data: logData } = await supabase
        .from('system_logs')
        .select('*')
        .or(`payload->>order_number.eq.${orderNumber},payload->>name.eq.${orderNumber}`)
        .eq('event_type', 'shopify_order_update_raw')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!logData || logData.length === 0) {
        console.error('Log not found for order number.');
        return;
    }

    const log = logData[0];
    const order = log.payload;
    const shopifyCustomerId = order.customer?.id?.toString();
    const financialStatus = order.financial_status;

    console.log('Order Details from Log:');
    console.log(`- Shopify ID: ${order.id}`);
    console.log(`- Financial Status: ${financialStatus}`);
    console.log(`- Customer Shopify ID: ${shopifyCustomerId}`);
    console.log(`- Customer Email: ${order.customer?.email}`);

    // 2. Search for client by multiple fields
    console.log('\nSearching for client...');
    const { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .or(`shopify_customer_id.eq.${shopifyCustomerId},email.eq.${clientEmail},email.eq.${order.customer?.email}`);

    if (clientError) {
        console.error('Search error:', clientError.message);
    } else {
        console.log(`Found ${clients.length} potential matches:`);
        clients.forEach(c => {
            console.log(`- ID: ${c.id}, Email: ${c.email}, ShopifyID: ${c.shopify_customer_id}, PlayerID: ${c.onesignal_player_id}`);
        });
    }

    // 3. Check if there are any linked logs for this order
    const { data: linkedLogs } = await supabase
        .from('system_logs')
        .select('event_type, payload')
        .eq('event_type', 'shopify_order_update_linked');

    const matchingLink = linkedLogs?.find(l => l.payload.orderNumber === orderNumber);
    if (matchingLink) {
        console.log('\nFound linked processing log:', matchingLink.payload);
    } else {
        console.log('\nNo shopify_order_update_linked found for this order.');
    }
}

debugOrderDetailed();

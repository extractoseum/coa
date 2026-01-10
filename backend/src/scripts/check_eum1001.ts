import { supabase } from '../config/supabase';

async function check() {
    // Find all orders matching EUM_1001
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_number, status, financial_status, fulfillment_status, client_id')
        .ilike('order_number', '%EUM_1001%');

    console.log('Orders matching EUM_1001:', JSON.stringify(orders, null, 2));

    // Check order_tracking for lyzelvia's tracking number
    const { data: tracking } = await supabase
        .from('order_tracking')
        .select('*')
        .ilike('tracking_number', '%0924414161%');

    console.log('\nTracking for 0924414161:', JSON.stringify(tracking, null, 2));

    // Check by Shopify order ID for EUM_1001_SHOP
    const { data: shopifyOrder } = await supabase
        .from('orders')
        .select('*, order_tracking(*)')
        .eq('order_number', 'EUM_1001_SHOP')
        .single();

    console.log('\nExact EUM_1001_SHOP:', JSON.stringify(shopifyOrder, null, 2));
}

check().then(() => process.exit(0));

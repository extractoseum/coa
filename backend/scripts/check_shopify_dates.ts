import { supabase } from '../src/config/supabase';

async function checkShopifyDates() {
    const orderNumbers = ['EUM_1117_SHOP', 'EUM_1321_SHOP', 'EUM_1484_SHOP'];
    console.log('--- Order Date Audit ---');

    const { data: orders, error } = await supabase
        .from('orders')
        .select('order_number, created_at, shopify_created_at')
        .in('order_number', orderNumbers);

    if (error) {
        console.error('Error:', error);
        return;
    }

    orders?.forEach(o => {
        console.log(`Order: ${o.order_number}`);
        console.log(`  DB Created At:      ${o.created_at}`);
        console.log(`  Shopify Created At: ${o.shopify_created_at}`);
        console.log('---');
    });
}

checkShopifyDates();

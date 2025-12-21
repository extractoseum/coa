import { supabase } from '../config/supabase';

async function inspectRecentOrders() {
    console.log('--- Inspecting Last 5 Updated Orders ---');
    const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_email, customer_phone, total_amount, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5);

    console.log('Orders:', JSON.stringify(orders, null, 2));
}

inspectRecentOrders();

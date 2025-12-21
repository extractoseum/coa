import { supabase } from '../config/supabase';

async function searchOrdersByPartialPhone() {
    const partialPhone = '3325794608'; // 523325794608 without country code
    console.log(`--- Searching orders for partial phone: ${partialPhone} ---`);

    const { data: orders } = await supabase
        .from('orders')
        .select('id, min_order_id, customer_phone, customer_email, total_amount')
        .ilike('customer_phone', `%${partialPhone}%`);

    console.log('Orders found:', JSON.stringify(orders, null, 2));
}

searchOrdersByPartialPhone();

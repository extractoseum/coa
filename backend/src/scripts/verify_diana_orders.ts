import { supabase } from '../config/supabase';

async function verifyDianaOrders() {
    console.log('--- Verifying Orders for 523325794608 ---');
    const { data: orders } = await supabase
        .from('orders')
        .select('id, min_order_id, customer_email, customer_phone, total_amount')
        .or('customer_phone.eq.+523325794608,customer_phone.eq.523325794608,customer_phone.eq.3325794608,customer_email.eq.diana@example.com'); // Broad search

    console.log('Orders found:', JSON.stringify(orders, null, 2));

    if (orders && orders.length > 0) {
        console.log('SUCCESS: Orders are now linkable by text fields!');
    } else {
        console.log('WARNING: Still no orders found by phone text.');
    }
}

verifyDianaOrders();

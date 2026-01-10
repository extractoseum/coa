import { supabase } from '../config/supabase';

async function check() {
    // Find client by email
    const { data: client } = await supabase
        .from('clients')
        .select('*')
        .ilike('email', '%lyzelvia%')
        .single();

    console.log('Client lyzelvia:', JSON.stringify(client, null, 2));

    if (client) {
        // Find their orders
        const { data: orders } = await supabase
            .from('orders')
            .select('*, order_tracking(*)')
            .eq('client_id', client.id);

        console.log('\nOrders for lyzelvia:', JSON.stringify(orders, null, 2));
    }

    // Also search orders by customer_email
    const { data: ordersByEmail } = await supabase
        .from('orders')
        .select('*, order_tracking(*)')
        .ilike('customer_email', '%lyzelvia%');

    console.log('\nOrders by email pattern:', JSON.stringify(ordersByEmail, null, 2));

    // Check how many orders we have total
    const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

    console.log('\nTotal orders in DB:', count);

    // Check orders with order number containing 1001
    const { data: ordersLike1001 } = await supabase
        .from('orders')
        .select('order_number, id')
        .ilike('order_number', '%1001%');

    console.log('\nOrders containing 1001:', JSON.stringify(ordersLike1001, null, 2));
}

check().then(() => process.exit(0));

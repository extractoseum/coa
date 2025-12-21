import { supabase } from './config/supabase';

async function listRecentOrders() {
    console.log('Listing 10 most recent orders...');
    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching orders:', error.message);
    } else {
        console.log('Recent Orders:', JSON.stringify(orders, null, 2));
    }

    console.log('Checking if system_logs table exists...');
    const { data: logTable, error: tableError } = await supabase
        .from('system_logs')
        .select('*')
        .limit(1);

    if (tableError) {
        console.error('system_logs error:', tableError.message);
    } else {
        console.log('system_logs exists and has data:', logTable.length > 0);
    }
}

listRecentOrders();

import { supabase } from './config/supabase';

async function checkOrderData() {
    console.log('Checking for order EUM_1399_SHOP in database...');

    const { data: order, error } = await supabase
        .from('orders')
        .select(`
            *,
            clients (
                id,
                email,
                name,
                phone,
                onesignal_player_id
            )
        `)
        .eq('order_number', 'EUM_1399_SHOP')
        .single();

    if (error) {
        console.error('Order not found:', error.message);
    } else {
        console.log('Order Data:', JSON.stringify(order, null, 2));
    }

    const { data: countData } = await supabase
        .from('system_logs')
        .select('count', { count: 'exact', head: true });

    console.log('Total logs in system_logs:', countData);
}

checkOrderData();

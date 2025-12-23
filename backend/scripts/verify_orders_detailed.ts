import { supabase } from '../src/config/supabase';

async function detailedVerification() {
    const reportTime = new Date('2025-12-23T00:34:00Z');
    const windowStart = new Date(reportTime.getTime() - 24 * 60 * 60 * 1000);

    console.log(`Report Window (UTC): ${windowStart.toISOString()} to ${reportTime.toISOString()}`);

    const { data: orders, error } = await supabase
        .from('orders')
        .select('order_number, created_at, status')
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', reportTime.toISOString())
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`\nTotal orders in window: ${orders?.length || 0}`);
    orders?.forEach((o, i) => {
        console.log(`${i + 1}. ${o.order_number} - ${o.created_at} (${o.status})`);
    });
}

detailedVerification();

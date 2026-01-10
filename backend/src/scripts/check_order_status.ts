import { supabase } from '../config/supabase';

async function checkOrders() {
    // Check specific orders
    const orderNumbers = ['EUM_1001_SHOP', 'EUM_1377_SHOP', 'EUM_1638_SHOP', 'EUM_1441_SHOP'];

    for (const orderNum of orderNumbers) {
        const { data: order, error } = await supabase
            .from('orders')
            .select('*, order_tracking(*)')
            .ilike('order_number', `%${orderNum}%`)
            .single();

        if (error) {
            console.log(`${orderNum}: NOT FOUND - ${error.message}`);
            continue;
        }

        console.log(`\n=== ${orderNum} ===`);
        console.log(`  status: ${order.status}`);
        console.log(`  financial_status: ${order.financial_status}`);
        console.log(`  fulfillment_status: ${order.fulfillment_status}`);

        const trackingCount = order.order_tracking ? order.order_tracking.length : 0;
        console.log(`  order_tracking count: ${trackingCount}`);

        if (order.order_tracking && order.order_tracking.length > 0) {
            order.order_tracking.forEach((t: any, i: number) => {
                console.log(`  tracking[${i}]: carrier=${t.carrier}, number=${t.tracking_number}, status=${t.current_status}`);
            });
        }
    }
}

checkOrders().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});

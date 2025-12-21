import { supabase } from './src/config/supabase';
import { updateOrderTracking } from './src/services/trackingService';

async function updateThisWeekOrders() {
    console.log('--- Updating status for orders from this week ---');

    // Calculate date for 7 days ago
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const isoDate = lastWeek.toISOString();

    console.log(`Checking orders created after: ${isoDate}`);

    // Fetch orders from this week that are not delivered
    const { data: activeOrders, error } = await supabase
        .from('orders')
        .select(`
            id,
            order_number,
            status,
            order_tracking (
                current_status
            )
        `)
        .gt('shopify_created_at', isoDate);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    if (!activeOrders || activeOrders.length === 0) {
        console.log('No active orders found from this week.');
        return;
    }

    console.log(`Found ${activeOrders.length} orders from this week.`);

    for (const order of activeOrders) {
        const trackingStatus = order.order_tracking?.[0]?.current_status;

        if (trackingStatus === 'delivered') {
            console.log(`Order ${order.order_number} is already delivered. Skipping.`);
            continue;
        }

        console.log(`Updating tracking for order: ${order.order_number} (Current status: ${trackingStatus || order.status})`);
        try {
            await updateOrderTracking(order.id);
            console.log(`Update triggered for ${order.order_number}`);
        } catch (err: any) {
            console.error(`Error updating ${order.order_number}:`, err.message);
        }

        // Brief delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('--- Weekly status update complete ---');
}

updateThisWeekOrders();

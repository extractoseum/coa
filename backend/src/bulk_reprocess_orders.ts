import { supabase } from './config/supabase';
import * as webhookController from './controllers/webhookController';

async function bulkReprocessOrders() {
    const ordersToProcess = ['EUM_1437_SHOP', 'EUM_1436_SHOP', 'EUM_1434_SHOP'];
    console.log(`--- Bulk Reprocessing Orders: ${ordersToProcess.join(', ')} ---`);

    for (const orderNumber of ordersToProcess) {
        console.log(`\nProcessing ${orderNumber}...`);

        // 1. Get the payload from logs
        const { data: logData } = await supabase
            .from('system_logs')
            .select('payload')
            .or(`payload->>order_number.eq.${orderNumber},payload->>name.eq.${orderNumber}`)
            .eq('event_type', 'shopify_order_update_raw')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!logData) {
            console.warn(`No payload found for ${orderNumber}, skipping.`);
            continue;
        }

        const payload = logData.payload;

        // 2. Mock Request/Response
        const req = {
            body: payload,
            get: (header: string) => null
        } as any;

        const res = {
            status: (code: number) => ({
                json: (data: any) => console.log(`Result [${code}]:`, data)
            })
        } as any;

        // 3. Call the handler
        try {
            await webhookController.handleOrderUpdate(req, res);
        } catch (e: any) {
            console.error(`Error processing ${orderNumber}:`, e.message);
        }
    }

    console.log('\nBulk processing complete.');
}

bulkReprocessOrders();

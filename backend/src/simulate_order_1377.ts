import { supabase } from './config/supabase';
// Import the handler indirectly by importing the processing logic if possible, 
// but it's easier to just copy the logic or import the controller if exported.
import * as webhookController from './controllers/webhookController';

async function simulateOrderProcessing() {
    const orderNumber = 'EUM_1377_SHOP';
    console.log(`--- Simulating processing for ${orderNumber} ---`);

    // 1. Get the payload from logs for EUM_1377_SHOP
    const { data: logData } = await supabase
        .from('system_logs')
        .select('payload')
        .or(`payload->>order_number.eq.${orderNumber},payload->>name.eq.${orderNumber}`)
        .eq('event_type', 'shopify_order_update_raw')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!logData) {
        console.error('No log payload found.');
        return;
    }

    const payload = logData.payload;

    // 2. Mock Request/Response
    const req = {
        body: payload,
        get: (header: string) => null // skip HMAC verification
    } as any;

    const res = {
        status: (code: number) => ({
            json: (data: any) => console.log(`Response [${code}]:`, data)
        })
    } as any;

    // 3. Call the handler
    console.log('Calling handleOrderUpdate...');
    await webhookController.handleOrderUpdate(req, res);

    console.log('\nProcessing simulation complete.');
}

simulateOrderProcessing();

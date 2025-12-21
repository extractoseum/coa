
const { supabase } = require('../dist/config/supabase');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
    console.log('Checking constraints on order_tracking...');
    const { data: constraints, error } = await supabase.rpc('get_table_constraints', { t_name: 'order_tracking' });

    if (error) {
        console.log('Error calling get_table_constraints (likely missing RPC):', error.message);
        // Fallback: try to insert a dummy record with same order_id but different tracking_number
        const orderId = 'd312ebc5-7d76-4475-b3eb-5c3a4fc023f8'; // from my earlier curl
        console.log(`Attempting to insert two records for order_id ${orderId} to test unique constraint...`);

        // Ensure clean state
        await supabase.from('order_tracking').delete().ilike('tracking_number', 'TEST-%');

        const { error: insert1Error } = await supabase
            .from('order_tracking')
            .insert({
                order_id: orderId,
                tracking_number: 'TEST-1-' + Date.now(),
                carrier: 'Test'
            });

        if (insert1Error) {
            console.log('First insert failed! Reason:', insert1Error.message);
        } else {
            console.log('First insert succeeded.');
            const { error: insert2Error } = await supabase
                .from('order_tracking')
                .insert({
                    order_id: orderId,
                    tracking_number: 'TEST-2-' + Date.now(),
                    carrier: 'Test'
                });

            if (insert2Error) {
                console.log('Second insert failed! Reason:', insert2Error.message);
                console.log('Error Code:', insert2Error.code);
            } else {
                console.log('Second insert succeeded. No unique constraint on order_id found.');
            }
        }
        // Cleanup
        await supabase.from('order_tracking').delete().ilike('tracking_number', 'TEST-%');
    } else {
        console.log('Constraints:', JSON.stringify(constraints, null, 2));
    }
}

main().catch(console.error);

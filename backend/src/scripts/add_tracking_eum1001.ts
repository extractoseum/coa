import { supabase } from '../config/supabase';

async function addTracking() {
    const orderId = '9c01e166-6de8-41f5-92b2-8c23535310a9';

    // Check if tracking exists
    const { data: existing } = await supabase
        .from('order_tracking')
        .select('*')
        .eq('order_id', orderId);

    console.log('Existing tracking:', existing);

    if (!existing || existing.length === 0) {
        // Insert new tracking
        const { data, error } = await supabase
            .from('order_tracking')
            .insert({
                order_id: orderId,
                carrier: 'Estafeta',
                tracking_number: '0924414161',
                tracking_url: 'https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=6055900880630703063458&wayBillType=0&isShipmentDetail=True',
                current_status: 'success'  // Estafeta delivered status
            })
            .select();

        if (error) {
            console.log('Insert error:', error);
        } else {
            console.log('Inserted tracking:', data);
        }
    } else {
        console.log('Tracking already exists');
    }

    // Verify
    const { data: finalOrder } = await supabase
        .from('orders')
        .select('*, order_tracking(*)')
        .eq('id', orderId)
        .single();

    console.log('\nFinal order state:', {
        order_number: finalOrder?.order_number,
        status: finalOrder?.status,
        financial_status: finalOrder?.financial_status,
        fulfillment_status: finalOrder?.fulfillment_status,
        tracking: finalOrder?.order_tracking
    });
}

addTracking().then(() => process.exit(0));

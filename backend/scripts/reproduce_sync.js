
const { supabase } = require('../dist/config/supabase');
const dotenv = require('dotenv');
dotenv.config();

const fulfillment = {
    "order_id": 6993280434348, // EUM_1325_SHOP
    "tracking_numbers": [
        "3055892120610706104294",
        "2015892120610605091008"
    ],
    "tracking_urls": [
        "https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=3055892120610706104294&wayBillType=0&isShipmentDetail=False",
        "https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=2015892120610605091008&wayBillType=0&isShipmentDetail=False"
    ],
    "tracking_company": "Estafeta"
};

async function reproduce() {
    const shopifyOrderId = fulfillment.order_id.toString();
    const trackingNumbers = fulfillment.tracking_numbers;
    const trackingUrls = fulfillment.tracking_urls;
    const carrier = fulfillment.tracking_company;

    console.log(`Processing fulfillment for order ${shopifyOrderId}...`);

    let { data: order } = await supabase
        .from('orders')
        .select('id, client_id, order_number')
        .eq('shopify_order_id', shopifyOrderId)
        .maybeSingle();

    if (!order) {
        console.log('Order not found in DB');
        return;
    }

    console.log(`Found order ${order.order_number} (${order.id})`);

    for (let i = 0; i < trackingNumbers.length; i++) {
        const trackingNumber = trackingNumbers[i];
        const trackingUrl = trackingUrls[i] || trackingUrls[0] || null;

        console.log(`Processing guide ${i + 1}/${trackingNumbers.length}: ${trackingNumber}`);

        const trackingData = {
            order_id: order.id,
            carrier: carrier,
            tracking_number: trackingNumber,
            tracking_url: trackingUrl,
            current_status: 'in_transit',
            updated_at: new Date().toISOString()
        };

        const { data: existingRows } = await supabase
            .from('order_tracking')
            .select('id')
            .eq('order_id', order.id)
            .eq('tracking_number', trackingNumber)
            .limit(1);

        if (existingRows && existingRows.length > 0) {
            console.log(`Guide ${trackingNumber} already exists. Updating...`);
            const { error } = await supabase
                .from('order_tracking')
                .update(trackingData)
                .eq('id', existingRows[0].id);
            if (error) console.error('Update error:', error);
            else console.log('Update success');
        } else {
            console.log(`Guide ${trackingNumber} is new. Inserting...`);
            const { error } = await supabase
                .from('order_tracking')
                .insert(trackingData);
            if (error) {
                console.error('Insert error:', error.message);
                console.error('Error Code:', error.code);
            }
            else console.log('Insert success');
        }
    }
}

reproduce().catch(console.error);

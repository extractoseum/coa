import { supabase } from '../config/supabase';

async function deepSearchDiana() {
    console.log(`--- Deep Searching Orders for 'Camacho' ---`);

    // 1. Dump one order to check schema
    const { data: sample } = await supabase.from('orders').select('*').limit(1);
    // console.log('Sample Order Keys:', Object.keys(sample?.[0] || {}));

    // 2. Search in JSONB fields or other text fields
    // Since Supabase doesn't easily support "search everywhere", we'll check common fields.

    // Check shipping_address JSONB (manual check below)
    /*
    const { data: shippingMatches } = await supabase
        .from('orders')
        .select('id, customer_email, customer_phone, shipping_address, total_amount')
        // .video('shipping_address->last_name', 'Camacho'); // Invalid method
    */

    // Try a raw text search on likely columns if simple filters fail.
    // Actually, let's just fetch recent orders and filter in memory if the dataset is small enough for a quick debug
    // or use specific text search on columns we suspect.

    const { data: allRecent } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    const camachoOrders = allRecent?.filter(o => {
        const str = JSON.stringify(o).toLowerCase();
        return str.includes('camacho');
    });

    console.log(`Found ${camachoOrders?.length} orders matching 'camacho' in last 50.`);
    if (camachoOrders && camachoOrders.length > 0) {
        console.log('Sample Match:', JSON.stringify(camachoOrders[0], null, 2));
    } else {
        console.log('No matches in last 50 orders.');
    }
}

deepSearchDiana();

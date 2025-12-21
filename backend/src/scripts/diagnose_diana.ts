import { supabase } from '../config/supabase';

async function diagnoseDiana() {
    const handle = '523325794608';
    console.log(`--- Diagnostics for ${handle} ---`);

    // 1. Client and Snapshot
    const { data: client } = await supabase
        .from('clients')
        .select('id, email, phone')
        .or(`email.eq.${handle},phone.eq.${handle}`)
        .maybeSingle();

    console.log('Client:', JSON.stringify(client, null, 2));

    const { data: snapshot } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .eq('contact_handle', handle)
        .maybeSingle();

    console.log('Snapshot:', JSON.stringify(snapshot, null, 2));

    // 2. Orders
    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .or(`customer_email.eq.${client?.email || 'N/A'},customer_phone.eq.${handle}`);

    console.log('Orders Count:', orders?.length || 0);
    if (orders && orders.length > 0) {
        console.log('Orders Total Amount:', orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0));
        console.log('Sample Order Handle:', orders[0].customer_phone || orders[0].customer_email);
    }

    // 3. Browsing Events
    const { data: events } = await supabase
        .from('browsing_events')
        .select('*')
        .or(`handle.eq.${handle},client_id.eq.${client?.id || '00000000-0000-0000-0000-000000000000'}`);

    console.log('Browsing Events Count:', events?.length || 0);
    if (events && events.length > 0) {
        console.log('Recent Event Handle:', events[0].handle);
    }

    // 4. Conversations
    const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_handle', handle)
        .maybeSingle();

    console.log('Conversation:', JSON.stringify(conv, null, 2));
}

diagnoseDiana();

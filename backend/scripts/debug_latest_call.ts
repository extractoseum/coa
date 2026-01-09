
import { supabase } from '../src/config/supabase';
import { handleLookupOrder } from '../src/services/VapiToolHandlers';

async function debugLastCall() {
    console.log('🔍 Finding latest call...');

    // 1. Get latest call
    const { data: calls, error } = await supabase
        .from('voice_calls')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1);

    if (error || !calls || calls.length === 0) {
        console.error('❌ No calls found or error:', error);
        return;
    }

    const lastCall = calls[0];
    console.log('📞 Latest Call:', {
        id: lastCall.id,
        phone: lastCall.phone_number,
        status: lastCall.status,
        started: lastCall.started_at
    });

    // 2. Simulate Order Lookup for this phone
    console.log('\n📦 Simulating lookup_order for:', lastCall.phone_number);

    // We need to mock the context
    // First retrieve client ID like the service does
    const context = {
        customerPhone: lastCall.phone_number,
        clientId: undefined as string | undefined
    };

    // Try to find client first to populate clientId (as the service does)
    const { data: client } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('phone', `%${lastCall.phone_number.slice(-10)}%`)
        .maybeSingle();

    if (client) {
        console.log('👤 Client found:', client.name, `(${client.id})`);
        context.clientId = client.id;
    } else {
        console.log('⚠️ No client found for this phone.');
    }

    // Run the tool handler
    const result = await handleLookupOrder({}, context);

    console.log('\n📊 Tool Result:');
    console.dir(result, { depth: null });

    // 3. Raw Order Query (Sanity Check)
    if (client) {
        console.log('\n==== RAW DB ORDERS (Last 3) ====');
        const { data: orders } = await supabase
            .from('orders')
            .select('*')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false })
            .limit(3);

        console.dir(orders, { depth: null });
    }
}

debugLastCall();

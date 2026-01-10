/**
 * Check delta's client and orders
 */
import 'dotenv/config';
import { supabase } from '../config/supabase';

async function checkDelta() {
    // Find client by phone or email
    const { data: clients } = await supabase
        .from('clients')
        .select('id, name, email, phone, shopify_customer_id')
        .or('phone.ilike.%3327177432%,email.eq.bdelatorre8@gmail.com');

    console.log('=== CLIENTS matching delta ===');
    console.log(JSON.stringify(clients, null, 2));

    if (clients && clients.length > 0) {
        for (const client of clients) {
            const { data: orders } = await supabase
                .from('orders')
                .select('id, order_number, status, financial_status, fulfillment_status, created_at')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false });

            console.log(`\n=== ORDERS for client ${client.id} (${client.name}) ===`);
            console.log(`Found ${orders?.length || 0} orders`);
            if (orders) {
                orders.forEach(o => console.log(`  ${o.order_number}: ${o.financial_status || o.status}`));
            }
        }
    }

    // Also check orders that might be orphaned or linked to old client_id
    console.log('\n=== Searching orders by phone in crm_contact_snapshots ===');
    const { data: snapshots } = await supabase
        .from('crm_contact_snapshots')
        .select('client_id, handle, email')
        .ilike('handle', '%3327177432%');

    console.log('Snapshots:', JSON.stringify(snapshots, null, 2));
}

checkDelta().then(() => process.exit(0));

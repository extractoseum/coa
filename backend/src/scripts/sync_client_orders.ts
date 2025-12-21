
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';
import { getShopifyCustomerByEmail, getShopifyCustomerOrders } from '../services/shopifyService';
import { CRMService } from '../services/CRMService';

async function syncClientOrders() {
    const email = 'bdelatorre8@gmail.com';
    console.log(`[Sync] Starting sync for ${email}...`);

    // 1. Get Client from DB
    const { data: client } = await supabase.from('clients').select('*').eq('email', email).single();
    if (!client) {
        console.error('Client not found in DB');
        return;
    }

    // 2. Get Orders from Shopify
    const shopifyCustomer = await getShopifyCustomerByEmail(email);
    if (!shopifyCustomer) {
        console.error('Customer not found in Shopify');
        return;
    }

    console.log(`[Sync] ID: ${shopifyCustomer.id}, Shopify Orders Count: ${shopifyCustomer.orders_count}`);

    const orders = await getShopifyCustomerOrders(shopifyCustomer.id);
    console.log(`[Sync] Fetching ${orders.length} orders...`);

    let totalSaved = 0;
    for (const order of orders) {
        // Upsert order
        const { error } = await supabase
            .from('orders')
            .upsert({
                client_id: client.id,
                shopify_order_id: order.id.toString(),
                order_number: order.name,
                status: order.financial_status === 'paid' ? 'paid' : 'created', // Simplify mapping
                total_amount: order.total_price,
                currency: order.currency,
                line_items: order.line_items || [],
                shopify_created_at: order.created_at,
                shopify_updated_at: order.updated_at
            }, { onConflict: 'shopify_order_id' });

        if (error) {
            console.error(`Error saving order ${order.name}:`, error.message);
        } else {
            totalSaved++;
        }
    }

    console.log(`[Sync] Saved ${totalSaved} orders locally.`);

    // 3. Update Client LTV/Count from Shopify data source of truth
    const { error: updateError } = await supabase
        .from('clients')
        .update({
            orders_count: shopifyCustomer.orders_count,
            total_spent: shopifyCustomer.total_spent,
            ltv: shopifyCustomer.total_spent, // Assuming LTV = Total Spent for now
            last_order_at: orders.length > 0 ? orders[0].created_at : null
        })
        .eq('id', client.id);

    if (updateError) console.error('Error updating client stats:', updateError);
    else console.log('[Sync] Client stats updated.');

    // 4. Trigger generic CRM Snapshap sync
    // The handle for snapshot might be the phone number "3327177432" or email depending on conversation
    // Since we merged them, we can try syncing by phone if available
    if (client.phone) {
        console.log(`[Sync] Triggering snapshot refresh for phone ${client.phone}...`);
        try {
            await CRMService.getInstance().syncContactSnapshot(client.phone, 'WA');
            console.log('[Sync] Snapshot refreshed.');
        } catch (e: any) {
            console.error('Snapshot sync failed:', e.message);
        }
    }
}

syncClientOrders();

import { supabase } from '../config/supabase';
import { notifyAbandonedRecovery } from './onesignalService';
import { logWebhook } from './loggerService';

/**
 * Service to handle recovery of abandoned orders and checkouts
 */
export const processAbandonedRecoveries = async () => {
    console.log('[Recovery] Starting recovery check...');
    const now = new Date().toISOString();

    try {
        // 1. Process Pending Orders (like Mercado Pago waiting for payment)
        // IMPORTANT: Exclude orders that are already paid, fulfilled, or delivered
        const { data: pendingOrders, error: orderError } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                total_amount,
                currency,
                abandoned_checkout_url,
                client_id,
                status,
                financial_status,
                fulfillment_status,
                clients (
                    id,
                    email,
                    name,
                    phone
                )
            `)
            .eq('recovery_status', 'pending')
            .lte('recovery_next_check_at', now)
            .not('status', 'in', '("paid","fulfilled","delivered","cancelled")')
            .limit(10);

        if (orderError) throw orderError;

        for (const order of pendingOrders) {
            // Double-check: Skip if order is already paid/fulfilled/delivered
            // This handles race conditions where status changed after the query
            const skipStatuses = ['paid', 'fulfilled', 'delivered', 'cancelled'];
            if (skipStatuses.includes(order.status) ||
                order.financial_status === 'paid' ||
                order.fulfillment_status === 'fulfilled') {
                console.log(`[Recovery] Skipping ${order.order_number} - already ${order.status || order.financial_status}`);
                // Mark as recovered so we don't check again
                await supabase
                    .from('orders')
                    .update({ recovery_status: 'converted', updated_at: now })
                    .eq('id', order.id);
                continue;
            }

            const client: any = Array.isArray(order.clients) ? order.clients[0] : order.clients;
            console.log(`[Recovery] Reminding abandoned order ${order.order_number} for client ${client?.email}`);

            // Send multi-channel notification
            const success = await notifyAbandonedRecovery(
                order.client_id,
                order.order_number,
                order.abandoned_checkout_url || `https://extractoseum.com/checkout`,
                client
            );

            // Update status to 'reminded' and set next check for 24h later (optional second reminder)
            const twentyFourHoursLater = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            await supabase
                .from('orders')
                .update({
                    recovery_status: 'reminded',
                    recovery_next_check_at: twentyFourHoursLater,
                    updated_at: now
                })
                .eq('id', order.id);

            // Log the recovery attempt
            await supabase.from('recovery_logs').insert({
                order_id: order.id,
                client_id: order.client_id,
                recovery_type: 'abandoned_order',
                channel: 'multi',
                status: success ? 'sent' : 'failed'
            });
        }

        // 2. Process Abandoned Checkouts (non-orders)
        const { data: pendingCheckouts, error: checkoutError } = await supabase
            .from('abandoned_checkouts')
            .select(`
                id,
                customer_name,
                checkout_url,
                client_id,
                email
            `)
            .eq('recovery_status', 'pending')
            .lte('recovery_next_check_at', now)
            .limit(10);

        if (checkoutError) throw checkoutError;

        for (const checkout of pendingCheckouts) {
            console.log(`[Recovery] Reminding abandoned checkout for ${checkout.email}`);

            // For checkouts without a client record yet, we might need a different notify function
            // but for now we assume they have a client record (created by the webhook)
            const success = await notifyAbandonedRecovery(
                checkout.client_id,
                'tu carrito',
                checkout.checkout_url,
                { name: checkout.customer_name, email: checkout.email }
            );

            await supabase
                .from('abandoned_checkouts')
                .update({
                    recovery_status: 'reminded',
                    recovery_next_check_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    updated_at: now
                })
                .eq('id', checkout.id);

            await supabase.from('recovery_logs').insert({
                checkout_id: checkout.id,
                client_id: checkout.client_id,
                recovery_type: 'abandoned_checkout',
                channel: 'multi',
                status: success ? 'sent' : 'failed'
            });
        }

    } catch (error: any) {
        console.error('[Recovery] Error in recovery process:', error.message);
    }
};

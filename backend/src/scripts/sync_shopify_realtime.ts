
import { supabase } from '../config/supabase';
import {
    searchShopifyCustomers,
    getShopifyCustomerOrders,
    getShopifyCustomerByEmail,
    ShopifyCustomer
} from '../services/shopifyService';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function syncShopifyRealtime() {
    console.log('--- Starting Realtime Shopify Sync (Robust) ---');

    // 1. Get active conversations
    const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('contact_handle, channel')
        .in('status', ['active', 'review', 'paused']);

    if (convError) {
        console.error('Failed to fetch conversations:', convError);
        return;
    }

    // Deduplicate handles
    const handles = Array.from(new Set(convs.map(c => c.contact_handle)));
    console.log(`Found ${handles.length} active handles to sync.`);

    for (const handle of handles) {
        console.log(`Syncing ${handle}...`);

        try {
            let shopifyCustomer: ShopifyCustomer | null = null;
            const isEmail = handle.includes('@');

            // 2. Find Customer in Shopify
            if (isEmail) {
                shopifyCustomer = await getShopifyCustomerByEmail(handle);
            } else {
                // If phone, try searching
                const results = await searchShopifyCustomers(`phone:${handle}`);
                if (results.length > 0) shopifyCustomer = results[0];
            }

            if (!shopifyCustomer) {
                console.log(`  [Skip/Cleanup] No Shopify customer found for ${handle}. Zeroing LTV.`);
                // 6. Update Snapshot (Zero out to remove stale mock data)
                await supabase
                    .from('crm_contact_snapshots')
                    .update({
                        ltv: 0,
                        orders_count: 0,
                        risk_level: 'low',
                        tags: [],
                        last_updated_at: new Date().toISOString()
                    })
                    .eq('handle', handle);

                await delay(1000); // Respect rate limit even on skip
                continue;
            }

            console.log(`  [Found] Shopify ID: ${shopifyCustomer.id} (${shopifyCustomer.first_name} ${shopifyCustomer.last_name})`);

            // 3. Upsert Client in Local DB
            const { data: client, error: clientError } = await supabase
                .from('clients')
                .upsert({
                    shopify_customer_id: shopifyCustomer.id.toString(),
                    email: shopifyCustomer.email,
                    phone: shopifyCustomer.phone,
                    name: `${shopifyCustomer.first_name} ${shopifyCustomer.last_name}`.trim(),
                    tags: shopifyCustomer.tags ? shopifyCustomer.tags.split(',').map(t => t.trim()) : [],
                    updated_at: new Date().toISOString()
                }, { onConflict: 'email' }) // Assuming email is unique key, or verify schema
                .select()
                .single();

            if (clientError) {
                console.error(`  [Error] Failed to upsert client:`, clientError.message);
                // Continue to snapshot even if client upsert fails?
                // Maybe better to skip to respect rate limit
            }

            // 4. Fetch Real Orders
            const orders = await getShopifyCustomerOrders(shopifyCustomer.id);
            console.log(`  [Orders] Found ${orders.length} orders in Shopify.`);

            // 5. Upsert Orders in Local DB
            if (orders.length > 0) {
                const orderPayloads = orders.map((o: any) => ({
                    client_id: client?.id, // Link to local client if available
                    shopify_order_id: o.id.toString(),
                    order_number: o.order_number,
                    customer_email: shopifyCustomer.email, // CRITICAL: Populate for fallback search
                    customer_phone: shopifyCustomer.phone || (shopifyCustomer as any).default_address?.phone, // CRITICAL: Fallback to address phone
                    total_amount: o.total_price,
                    currency: o.currency,
                    status: o.financial_status === 'paid' ? 'paid' : o.financial_status,
                    created_at: o.created_at,
                    updated_at: o.updated_at
                }));

                const { error: orderError } = await supabase
                    .from('orders')
                    .upsert(orderPayloads, { onConflict: 'shopify_order_id' });

                if (orderError) {
                    console.error(`  [Error] Failed to upsert orders:`, orderError.message);
                } else {
                    console.log(`  [Success] Synced ${orders.length} orders.`);
                }
            }

            // 6. Update Snapshot (LTV & Badges)
            const ltv = parseFloat(shopifyCustomer.total_spent || '0');
            const orderCount = shopifyCustomer.orders_count;
            const tags = shopifyCustomer.tags ? shopifyCustomer.tags.split(',').map(t => t.trim()) : [];

            // Logic for badges (mix of Shopify tags + calculated risk)
            const risk_level = ltv > 5000 ? 'vip' : 'low';

            await supabase
                .from('crm_contact_snapshots')
                .upsert({
                    handle: handle,
                    channel: convs.find(c => c.contact_handle === handle)?.channel || 'UNKNOWN',
                    name: `${shopifyCustomer.first_name} ${shopifyCustomer.last_name}`.trim(),
                    ltv: ltv,
                    orders_count: orderCount,
                    risk_level: risk_level,
                    tags: tags,
                    last_updated_at: new Date().toISOString()
                }, { onConflict: 'handle' });

            console.log(`  [Snapshot] Updated LTV: $${ltv}, Tags: ${tags.length}`);

            // 7. Wait to avoid rate limit (2 req/s is standard, we do multiple calls per user)
            await delay(1000);

        } catch (err: any) {
            console.error(`  [Error] Processing ${handle}:`, err.message);
            await delay(2000); // Wait longer on error
        }
    }

    console.log('--- Realtime Sync Complete ---');
}

syncShopifyRealtime().catch(console.error);

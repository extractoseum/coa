/**
 * Sync All Shopify Orders
 *
 * Fetches ALL orders from Shopify and syncs them to the database
 * including line_items for Oracle predictions.
 *
 * Run with: npx ts-node src/scripts/sync_all_shopify_orders.ts
 */

import axios from 'axios';
import { supabase } from '../config/supabase';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || '';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const shopifyApi = axios.create({
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    }
});

const getBaseUrl = () => `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

interface ShopifyOrder {
    id: number;
    name: string;
    email: string;
    total_price: string;
    currency: string;
    financial_status: string;
    created_at: string;
    updated_at: string;
    cancelled_at: string | null;
    customer?: {
        id: number;
        email: string;
        phone: string | null;
        first_name: string;
        last_name: string;
        default_address?: {
            phone: string | null;
        };
    };
    line_items: Array<{
        product_id: number;
        variant_id: number;
        title: string;
        quantity: number;
        price: string;
    }>;
}

async function fetchAllOrders(): Promise<ShopifyOrder[]> {
    const allOrders: ShopifyOrder[] = [];
    let pageInfo: string | null = null;
    let page = 1;

    console.log('📦 Fetching orders from Shopify...\n');

    while (true) {
        try {
            let url = `${getBaseUrl()}/orders.json?status=any&limit=250`;
            if (pageInfo) {
                url = `${getBaseUrl()}/orders.json?page_info=${pageInfo}&limit=250`;
            }

            const response = await shopifyApi.get(url);
            const orders = response.data.orders as ShopifyOrder[];

            if (!orders || orders.length === 0) {
                break;
            }

            allOrders.push(...orders);
            console.log(`   Page ${page}: fetched ${orders.length} orders (total: ${allOrders.length})`);

            // Check for next page via Link header
            const linkHeader = response.headers.link;
            if (linkHeader && linkHeader.includes('rel="next"')) {
                const match = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
                if (match) {
                    pageInfo = match[1];
                } else {
                    break;
                }
            } else {
                break;
            }

            page++;
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error: any) {
            console.error(`   ❌ Error fetching page ${page}:`, error.message);
            break;
        }
    }

    return allOrders;
}

async function getOrCreateClient(customer: ShopifyOrder['customer'], email: string) {
    if (!email && !customer) return null;

    const customerEmail = email || customer?.email;
    const shopifyId = customer?.id?.toString();

    // Try to find by Shopify ID
    if (shopifyId) {
        const { data: client } = await supabase
            .from('clients')
            .select('id, email')
            .eq('shopify_customer_id', shopifyId)
            .maybeSingle();

        if (client) return client;
    }

    // Try to find by email
    if (customerEmail) {
        const { data: client } = await supabase
            .from('clients')
            .select('id, email')
            .eq('email', customerEmail)
            .maybeSingle();

        if (client) return client;
    }

    // Create new client
    if (customerEmail) {
        const name = customer
            ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customerEmail.split('@')[0]
            : customerEmail.split('@')[0];
        const phone = customer?.phone || customer?.default_address?.phone || null;

        const { data: newClient, error } = await supabase
            .from('clients')
            .insert({
                email: customerEmail,
                shopify_customer_id: shopifyId,
                name: name,
                phone: phone,
                role: 'client'
            })
            .select('id, email')
            .single();

        if (error) {
            console.error(`   ⚠️ Error creating client ${customerEmail}:`, error.message);
            return null;
        }

        return newClient;
    }

    return null;
}

async function syncAllOrders() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       SYNC ALL SHOPIFY ORDERS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
        console.error('❌ Missing Shopify credentials');
        return;
    }

    const orders = await fetchAllOrders();
    console.log(`\n✅ Fetched ${orders.length} total orders from Shopify\n`);

    let created = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const email = order.email || order.customer?.email;

        if (!email) {
            skipped++;
            continue;
        }

        try {
            // Get or create client
            const client = await getOrCreateClient(order.customer, email);
            if (!client) {
                skipped++;
                continue;
            }

            // Extract line_items
            const lineItems = order.line_items.map(item => ({
                product_id: item.product_id?.toString(),
                variant_id: item.variant_id?.toString(),
                title: item.title,
                quantity: item.quantity,
                price: item.price
            }));

            // Determine status
            let status = order.financial_status === 'paid' ? 'paid' : 'created';
            if (order.cancelled_at) status = 'cancelled';

            // Check if order exists
            const { data: existing } = await supabase
                .from('orders')
                .select('id')
                .eq('shopify_order_id', order.id)
                .maybeSingle();

            // Upsert order
            const { error } = await supabase
                .from('orders')
                .upsert({
                    client_id: client.id,
                    shopify_order_id: order.id,
                    order_number: order.name,
                    status: status,
                    total_amount: parseFloat(order.total_price),
                    currency: order.currency,
                    shopify_created_at: order.created_at,
                    shopify_updated_at: order.updated_at,
                    line_items: lineItems,
                    customer_email: email,
                    customer_phone: order.customer?.phone || order.customer?.default_address?.phone || null
                }, { onConflict: 'shopify_order_id' });

            if (error) {
                console.error(`   ❌ Error syncing ${order.name}:`, error.message);
                failed++;
            } else {
                if (existing) {
                    updated++;
                } else {
                    created++;
                }
            }

            // Progress log every 50 orders
            if ((i + 1) % 50 === 0) {
                console.log(`   Progress: ${i + 1}/${orders.length} (created: ${created}, updated: ${updated})`);
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));

        } catch (err: any) {
            console.error(`   ❌ Error processing ${order.name}:`, err.message);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    SYNC COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Created: ${created}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Skipped (no email): ${skipped}`);
    console.log('═══════════════════════════════════════════════════════════\n');
}

syncAllOrders().catch(console.error);

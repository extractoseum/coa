import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function inspectOrders() {
    const now = new Date();
    const window24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`Current Server Time (UTC): ${now.toISOString()}`);
    console.log(`Rolling 24h Window Start: ${window24h}`);

    const { data: orders, error } = await supabase
        .from('orders')
        .select('order_number, shopify_created_at, created_at, status')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log('\n--- Recent Orders (Last 30) ---');
    console.table(orders.map(o => ({
        Number: o.order_number,
        ShopifyTime: o.shopify_created_at,
        DB_Created: o.created_at,
        Status: o.status,
        In24h: o.shopify_created_at && o.shopify_created_at >= window24h ? 'YES' : 'NO'
    })));

    const count24h = orders.filter(o => o.shopify_created_at && o.shopify_created_at >= window24h).length;
    console.log(`\nCount in last 24h (Shopify Time): ${count24h}`);
}

inspectOrders();

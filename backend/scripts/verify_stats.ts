import { supabase } from '../src/config/supabase';

async function verifyActiveStats() {
    console.log('--- STATS VERIFICATION ---');
    const window24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Unique Scanners (IPs)
    const { data: scans } = await supabase
        .from('coa_scans')
        .select('ip_hash')
        .gte('scanned_at', window24h);
    const uniqueIps = new Set(scans?.map(s => s.ip_hash) || []);

    // 2. Unique Orderers (Client IDs)
    const { data: orders } = await supabase
        .from('orders')
        .select('client_id, order_number, created_at')
        .gte('created_at', window24h);
    const uniqueOrderers = new Set(orders?.map(o => o.client_id).filter(Boolean) || []);

    // 3. Unique Logins (Client IDs)
    const { data: logins } = await supabase
        .from('clients')
        .select('id')
        .gte('last_login_at', window24h);
    const uniqueLogins = new Set(logins?.map(l => l.id) || []);

    // Total registered active
    const totalRegisteredActive = new Set([...Array.from(uniqueOrderers), ...Array.from(uniqueLogins)]);

    console.log(`Report Window: Since ${window24h}`);
    console.log(`Unique Anonymous Scanners (unique_ips): ${uniqueIps.size}`);
    console.log(`Unique Orderers (unique_orderers): ${uniqueOrderers.size}`);
    console.log(`Unique Logins (unique_logins): ${uniqueLogins.size}`);
    console.log(`Total Registered Active (Set Union): ${totalRegisteredActive.size}`);
    console.log(`Orders Today (Total count): ${orders?.length || 0}`);
    console.log(`Grand Total (Calculated by Tool): ${totalRegisteredActive.size + uniqueIps.size}`);

    if (orders && orders.length > 0) {
        console.log('\nMost Recent 10 Orders:');
        const sorted = orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        sorted.slice(0, 10).forEach(o => console.log(`  - ${o.order_number} (${o.created_at})`));

        const before0034 = sorted.filter(o => new Date(o.created_at).getTime() < new Date('2025-12-23T00:34:00.000Z').getTime());
        console.log(`\nOrders before 00:34 UTC: ${before0034.length}`);
    }
}

verifyActiveStats();

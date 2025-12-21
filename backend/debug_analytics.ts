
import { supabase } from './src/config/supabase';

async function debugAnalytics() {
    console.log('--- ANALYTICS DEBUG ---');

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));

    console.log(`Current Time (UTC): ${new Date().toISOString()}`);
    console.log(`24h Window Start: ${twentyFourHoursAgo.toISOString()}`);
    console.log(`Today (UTC) Start: ${startOfToday.toISOString()}`);

    // 1. Total Scans (All time)
    const { count: totalAllTime } = await supabase.from('coa_scans').select('*', { count: 'exact', head: true });
    console.log(`Total Scans (All time): ${totalAllTime}`);

    // 2. Scans in last 24h
    const { data: scans24h, error: error24h } = await supabase
        .from('coa_scans')
        .select('id, ip_hash, scanned_at, country_code, city')
        .gte('scanned_at', twentyFourHoursAgo.toISOString());

    if (error24h) {
        console.error('Error fetching 24h scans:', error24h);
    } else {
        const uniqueIps = new Set(scans24h.map(s => s.ip_hash));
        console.log(`Last 24h: ${scans24h.length} scans from ${uniqueIps.size} unique IPs`);

        // Print sample
        if (scans24h.length > 0) {
            console.log('Sample scans:', scans24h.slice(0, 5));
        }
    }

    // 3. Scans in "Today" (UTC)
    const { data: scansToday } = await supabase
        .from('coa_scans')
        .select('id, ip_hash')
        .gte('scanned_at', startOfToday.toISOString());

    const uniqueIpsToday = new Set(scansToday?.map(s => s.ip_hash) || []);
    console.log(`Today (UTC): ${scansToday?.length || 0} scans from ${uniqueIpsToday.size} unique IPs`);

    // 4. Check for other activity (analytics_events if exists)
    try {
        const { count: evCount } = await supabase.from('analytics_events').select('*', { count: 'exact', head: true });
        console.log(`Total Analytics Events: ${evCount}`);
    } catch (e) {
        console.log('analytics_events table not found or inaccessible');
    }

    process.exit(0);
}

debugAnalytics();

/**
 * FINAL TRACKING SYSTEM AUDIT
 * Comprehensive verification of all endpoints and data flows
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function audit() {
    console.log('╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║          FINAL TRACKING SYSTEM AUDIT - COA VIEWER 2.0 / EUM              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════════════════════════════════════════
    // 1. BROWSING EVENTS (Behavior Tracking)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('  1. BROWSING EVENTS (/api/behavior/track → browsing_events)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const { count: browsingTotal } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true });

    const { data: browsingByType } = await supabase
        .from('browsing_events')
        .select('event_type');

    const browsingTypeCounts: Record<string, number> = {};
    browsingByType?.forEach((e: { event_type: string }) => {
        browsingTypeCounts[e.event_type] = (browsingTypeCounts[e.event_type] || 0) + 1;
    });

    console.log(`   Total Events: ${browsingTotal}`);
    console.log('   By Type:');
    Object.entries(browsingTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`      ${type}: ${count}`);
    });

    // Check identity fields
    const { count: withSession } = await supabase.from('browsing_events').select('*', { count: 'exact', head: true }).not('session_id', 'is', null);
    const { count: withHandle } = await supabase.from('browsing_events').select('*', { count: 'exact', head: true }).not('handle', 'is', null);
    const { count: withClient } = await supabase.from('browsing_events').select('*', { count: 'exact', head: true }).not('client_id', 'is', null);

    console.log('\n   Identity Coverage:');
    console.log(`      With session_id: ${withSession} (${((withSession || 0) / (browsingTotal || 1) * 100).toFixed(1)}%)`);
    console.log(`      With handle: ${withHandle} (${((withHandle || 0) / (browsingTotal || 1) * 100).toFixed(1)}%)`);
    console.log(`      With client_id: ${withClient} (${((withClient || 0) / (browsingTotal || 1) * 100).toFixed(1)}%)`);

    // Check domains
    const { data: browsingUrls } = await supabase.from('browsing_events').select('url').not('url', 'is', null);
    const browsingDomains: Record<string, number> = {};
    browsingUrls?.forEach((e: { url: string | null }) => {
        if (e.url) {
            try {
                const domain = new URL(e.url).hostname;
                browsingDomains[domain] = (browsingDomains[domain] || 0) + 1;
            } catch {}
        }
    });

    console.log('\n   By Domain:');
    Object.entries(browsingDomains).sort((a, b) => b[1] - a[1]).forEach(([domain, count]) => {
        console.log(`      ${domain}: ${count}`);
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // 2. SYSTEM LOGS (Telemetry)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('  2. SYSTEM LOGS (/api/v1/logs → system_logs)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const { count: logsTotal } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true });

    const { data: logsByType } = await supabase
        .from('system_logs')
        .select('event_type, category');

    const logsTypeCounts: Record<string, number> = {};
    logsByType?.forEach((e: { event_type: string; category: string }) => {
        const key = `${e.category}/${e.event_type}`;
        logsTypeCounts[key] = (logsTypeCounts[key] || 0) + 1;
    });

    console.log(`   Total Logs: ${logsTotal}`);
    console.log('   By Category/Type:');
    Object.entries(logsTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([type, count]) => {
        console.log(`      ${type}: ${count}`);
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // 3. COA ANALYTICS (COA Access Tracking)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('  3. COA ANALYTICS (/api/v1/analytics/track → coa_analytics)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const { count: analyticsTotal } = await supabase
        .from('coa_analytics')
        .select('*', { count: 'exact', head: true });

    const { data: analyticsByType } = await supabase
        .from('coa_analytics')
        .select('access_type');

    const analyticsTypeCounts: Record<string, number> = {};
    analyticsByType?.forEach((e: { access_type: string }) => {
        analyticsTypeCounts[e.access_type] = (analyticsTypeCounts[e.access_type] || 0) + 1;
    });

    console.log(`   Total COA Access Events: ${analyticsTotal}`);
    console.log('   By Access Type:');
    Object.entries(analyticsTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`      ${type}: ${count}`);
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // 4. CRM CONTACT SNAPSHOTS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('  4. CRM CONTACT SNAPSHOTS (/api/v1/crm/contact → crm_contact_snapshots)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const { count: snapshotsTotal } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true });

    console.log(`   Total Snapshots: ${snapshotsTotal}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // 5. CONVERSATIONS (CRM)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('  5. CONVERSATIONS (CRM Core)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const { count: convsTotal } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

    const { data: convsByChannel } = await supabase
        .from('conversations')
        .select('channel');

    const channelCounts: Record<string, number> = {};
    convsByChannel?.forEach((e: { channel: string }) => {
        channelCounts[e.channel] = (channelCounts[e.channel] || 0) + 1;
    });

    console.log(`   Total Conversations: ${convsTotal}`);
    console.log('   By Channel:');
    Object.entries(channelCounts).sort((a, b) => b[1] - a[1]).forEach(([channel, count]) => {
        console.log(`      ${channel}: ${count}`);
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // 6. CLIENTS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('  6. CLIENTS (Identity Store)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const { count: clientsTotal } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

    const { count: withRealEmail } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .not('email', 'ilike', '%@noemail.eum');

    console.log(`   Total Clients: ${clientsTotal}`);
    console.log(`   With Real Email: ${withRealEmail} (${((withRealEmail || 0) / (clientsTotal || 1) * 100).toFixed(1)}%)`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // 7. ENDPOINT COVERAGE SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         ENDPOINT COVERAGE SUMMARY                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

    const endpoints = [
        { name: 'POST /api/behavior/track', table: 'browsing_events', count: browsingTotal, status: browsingTotal && browsingTotal > 0 },
        { name: 'POST /api/v1/logs', table: 'system_logs', count: logsTotal, status: logsTotal && logsTotal > 0 },
        { name: 'POST /api/v1/analytics/track/:token', table: 'coa_analytics', count: analyticsTotal, status: analyticsTotal && analyticsTotal > 0 },
        { name: 'GET /api/v1/crm/contact/:handle', table: 'crm_contact_snapshots', count: snapshotsTotal, status: snapshotsTotal && snapshotsTotal > 0 },
        { name: 'CRM Conversations', table: 'conversations', count: convsTotal, status: convsTotal && convsTotal > 0 },
        { name: 'Identity Store', table: 'clients', count: clientsTotal, status: clientsTotal && clientsTotal > 0 }
    ];

    console.log('   ┌─────────────────────────────────────────────┬─────────────────────┬──────────┐');
    console.log('   │ Endpoint                                    │ Table               │ Records  │');
    console.log('   ├─────────────────────────────────────────────┼─────────────────────┼──────────┤');

    endpoints.forEach(ep => {
        const statusIcon = ep.status ? '✅' : '⚠️';
        const name = ep.name.padEnd(43);
        const table = ep.table.padEnd(19);
        const count = String(ep.count || 0).padStart(6);
        console.log(`   │ ${statusIcon} ${name}│ ${table} │ ${count}   │`);
    });

    console.log('   └─────────────────────────────────────────────┴─────────────────────┴──────────┘');

    // ═══════════════════════════════════════════════════════════════════════════════
    // 8. IDENTITY GRAPH STATUS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          IDENTITY GRAPH STATUS                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

    // Check fingerprints in metadata
    const { data: recentMetadata } = await supabase
        .from('browsing_events')
        .select('metadata')
        .not('metadata', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

    let fpCount = 0;
    let ipCount = 0;
    recentMetadata?.forEach((e: { metadata: Record<string, unknown> | null }) => {
        if (e.metadata?.fingerprint) fpCount++;
        if (e.metadata?.ip) ipCount++;
    });

    console.log('   Session Tracking:');
    console.log(`      ${withSession && withSession > 0 ? '✅' : '❌'} Events with session_id: ${withSession || 0}`);
    console.log(`      ${fpCount > 0 ? '✅' : '⏳'} Events with fingerprint (last 100): ${fpCount}`);
    console.log(`      ${ipCount > 0 ? '✅' : '⏳'} Events with IP (last 100): ${ipCount}`);

    console.log('\n   User Identification:');
    console.log(`      ${withHandle && withHandle > 0 ? '✅' : '❌'} Events linked to email/phone: ${withHandle || 0}`);
    console.log(`      ${withClient && withClient > 0 ? '✅' : '❌'} Events linked to client_id: ${withClient || 0}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // 9. RECENT ACTIVITY (Last 24h)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         RECENT ACTIVITY (24h)                             ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: browsing24h } = await supabase.from('browsing_events').select('*', { count: 'exact', head: true }).gte('created_at', yesterday);
    const { count: logs24h } = await supabase.from('system_logs').select('*', { count: 'exact', head: true }).gte('created_at', yesterday);
    const { count: analytics24h } = await supabase.from('coa_analytics').select('*', { count: 'exact', head: true }).gte('created_at', yesterday);

    console.log(`   Browsing Events: ${browsing24h || 0}`);
    console.log(`   System Logs: ${logs24h || 0}`);
    console.log(`   COA Analytics: ${analytics24h || 0}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // 10. ACTION ITEMS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                              ACTION ITEMS                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

    const actions: string[] = [];

    if (!withSession || withSession === 0) {
        actions.push('⚠️  Install updated Shopify tracking script (docs/SHOPIFY_TRACKING_SCRIPT.liquid)');
    }

    if (fpCount === 0) {
        actions.push('⏳ Fingerprint tracking will appear after new visits with updated script');
    }

    if (Object.keys(browsingDomains).length === 1 && browsingDomains['extractoseum.com']) {
        actions.push('ℹ️  COA Viewer (coa.extractoseum.com) events will appear after frontend deploy');
    }

    if (actions.length === 0) {
        actions.push('✅ All systems operational! No action required.');
    }

    actions.forEach(a => console.log(`   ${a}`));

    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('                          AUDIT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

audit().catch(console.error);

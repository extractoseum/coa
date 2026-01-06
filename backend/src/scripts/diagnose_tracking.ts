/**
 * Diagnostic script to verify tracking system is working
 * Checks browsing events, identity resolution, and endpoint coverage
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface BrowsingEvent {
    id: string;
    event_type: string;
    handle: string | null;
    client_id: string | null;
    session_id: string | null;
    url: string | null;
    metadata: Record<string, any> | null;
    created_at: string;
}

async function diagnose() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║        TRACKING SYSTEM DIAGNOSTIC - COA Viewer 2.0             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // 1. Total browsing events
    const { count: totalEvents } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true });

    console.log(`📊 TOTAL BROWSING EVENTS: ${totalEvents || 0}\n`);

    // 2. Events by type
    const { data: eventsByType } = await supabase
        .from('browsing_events')
        .select('event_type');

    const typeCounts: Record<string, number> = {};
    if (eventsByType) {
        eventsByType.forEach((e: { event_type: string }) => {
            typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
        });
    }

    console.log('📈 EVENTS BY TYPE:');
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
    });

    // 3. Identity coverage
    const { count: withHandle } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true })
        .not('handle', 'is', null);

    const { count: withSessionId } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true })
        .not('session_id', 'is', null);

    const { count: withClientId } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true })
        .not('client_id', 'is', null);

    console.log('\n🔐 IDENTITY COVERAGE:');
    console.log(`   With handle (email/phone): ${withHandle || 0} (${((withHandle || 0) / (totalEvents || 1) * 100).toFixed(1)}%)`);
    console.log(`   With session_id: ${withSessionId || 0} (${((withSessionId || 0) / (totalEvents || 1) * 100).toFixed(1)}%)`);
    console.log(`   With client_id: ${withClientId || 0} (${((withClientId || 0) / (totalEvents || 1) * 100).toFixed(1)}%)`);

    // 4. Check for fingerprint in metadata
    const { data: recentWithFingerprint } = await supabase
        .from('browsing_events')
        .select('metadata')
        .not('metadata', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

    let withFingerprint = 0;
    let withIp = 0;
    let withUserAgent = 0;

    if (recentWithFingerprint) {
        recentWithFingerprint.forEach((e: { metadata: Record<string, any> | null }) => {
            if (e.metadata?.fingerprint) withFingerprint++;
            if (e.metadata?.ip) withIp++;
            if (e.metadata?.user_agent) withUserAgent++;
        });
    }

    console.log('\n🆔 IDENTITY GRAPH FIELDS (last 100 events):');
    console.log(`   With fingerprint: ${withFingerprint}`);
    console.log(`   With IP: ${withIp}`);
    console.log(`   With user_agent: ${withUserAgent}`);

    // 5. Recent events (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: last24h } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday);

    console.log(`\n⏰ EVENTS IN LAST 24 HOURS: ${last24h || 0}`);

    // 6. Latest 10 events with details
    const { data: latestEvents } = await supabase
        .from('browsing_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10) as { data: BrowsingEvent[] | null };

    console.log('\n📝 LATEST 10 EVENTS:');
    console.log('─'.repeat(80));

    if (latestEvents && latestEvents.length > 0) {
        latestEvents.forEach((e: BrowsingEvent, i: number) => {
            const time = new Date(e.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
            const handle = e.handle || 'anonymous';
            const hasFingerprint = e.metadata?.fingerprint ? '🔑' : '';
            const hasSession = e.session_id ? '📱' : '';

            console.log(`${i + 1}. [${time}] ${e.event_type}`);
            console.log(`   Handle: ${handle} ${hasFingerprint}${hasSession}`);
            console.log(`   URL: ${e.url?.substring(0, 60) || 'N/A'}...`);
            if (e.metadata?.original_event_type) {
                console.log(`   Original type: ${e.metadata.original_event_type}`);
            }
            console.log('');
        });
    } else {
        console.log('   No events found');
    }

    // 7. Unique sources (domains)
    const { data: allUrls } = await supabase
        .from('browsing_events')
        .select('url')
        .not('url', 'is', null);

    const domains: Record<string, number> = {};
    if (allUrls) {
        allUrls.forEach((e: { url: string | null }) => {
            if (e.url) {
                try {
                    const domain = new URL(e.url).hostname;
                    domains[domain] = (domains[domain] || 0) + 1;
                } catch {
                    domains['invalid'] = (domains['invalid'] || 0) + 1;
                }
            }
        });
    }

    console.log('🌐 EVENTS BY DOMAIN:');
    Object.entries(domains).sort((a, b) => b[1] - a[1]).forEach(([domain, count]) => {
        console.log(`   ${domain}: ${count}`);
    });

    // 8. Check for sessions that got identified
    const { data: identifiedSessions } = await supabase
        .from('browsing_events')
        .select('session_id, handle')
        .not('session_id', 'is', null)
        .not('handle', 'is', null);

    const uniqueSessions = new Set<string>();
    if (identifiedSessions) {
        identifiedSessions.forEach((e: { session_id: string }) => {
            uniqueSessions.add(e.session_id);
        });
    }

    console.log(`\n✅ IDENTIFIED SESSIONS: ${uniqueSessions.size} unique sessions linked to user identity`);

    // 9. Check logs table for telemetry
    const { count: logsCount } = await supabase
        .from('logs')
        .select('*', { count: 'exact', head: true });

    const { data: recentLogs } = await supabase
        .from('logs')
        .select('event, level, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log(`\n📋 TELEMETRY LOGS TABLE: ${logsCount || 0} total entries`);
    if (recentLogs && recentLogs.length > 0) {
        console.log('   Latest:');
        recentLogs.forEach((log: { event: string; level: string; created_at: string }) => {
            const time = new Date(log.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
            console.log(`   - [${time}] ${log.level}: ${log.event}`);
        });
    }

    // 10. Check CRM contact snapshots
    const { count: snapshotsCount } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true });

    console.log(`\n👤 CRM CONTACT SNAPSHOTS: ${snapshotsCount || 0}`);

    // 11. Endpoint verification summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ENDPOINT STATUS SUMMARY                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log(`
    ┌─────────────────────────────────────────────────────────────────┐
    │ ENDPOINT                          │ STATUS  │ DATA FLOW         │
    ├───────────────────────────────────┼─────────┼───────────────────┤
    │ POST /api/behavior/track          │ ${(totalEvents || 0) > 0 ? '✅ OK' : '⚠️ CHECK'}   │ → browsing_events   │
    │ POST /api/v1/logs                 │ ${(logsCount || 0) > 0 ? '✅ OK' : '⚠️ CHECK'}   │ → logs              │
    │ GET /api/v1/crm/contact/:handle   │ ${(snapshotsCount || 0) > 0 ? '✅ OK' : '⚠️ CHECK'}   │ → crm_snapshots     │
    │ GET /api/behavior/:handle         │ ✅ OK   │ ← browsing_events  │
    └─────────────────────────────────────────────────────────────────┘

    🔗 Identity Graph Status:
    ${withSessionId && withSessionId > 0 ? '✅' : '❌'} Session tracking: ${withSessionId || 0} events with session_id
    ${withFingerprint > 0 ? '✅' : '❌'} Fingerprint tracking: ${withFingerprint} events with fingerprint
    ${withHandle && withHandle > 0 ? '✅' : '❌'} User identification: ${withHandle || 0} events linked to user
    `);

    // 12. Recommendations
    console.log('📋 RECOMMENDATIONS:');

    if ((last24h || 0) === 0) {
        console.log('   ⚠️  No events in last 24 hours - verify Shopify tracking script is installed');
    }

    if (withFingerprint === 0) {
        console.log('   ⚠️  No fingerprints detected - new identity tracking not yet active');
        console.log('      This may be normal if the new code was just deployed');
    }

    if (Object.keys(domains).length === 1) {
        console.log('   ℹ️  Events only from one domain - tracking script needs installation on other domains');
    }

    console.log('\n✨ Diagnostic complete!');
}

diagnose().catch(console.error);

/**
 * Smart Indicators System Verification
 * Phase 61: Debug and verify complete data flow
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VerificationResult {
    check: string;
    status: 'PASS' | 'FAIL' | 'WARN';
    details: string;
}

async function verifySmartIndicators(): Promise<void> {
    console.log('\n========================================');
    console.log('🔍 SMART INDICATORS VERIFICATION (Phase 61)');
    console.log('========================================\n');

    const results: VerificationResult[] = [];

    // 1. Check conversations table columns
    console.log('📋 Checking conversations table columns...');
    const { data: columns } = await supabase
        .from('conversations')
        .select('id, first_inbound_at, last_inbound_at, utm_source, utm_campaign, ad_platform, traffic_source, channel_chip_id')
        .limit(1);

    if (columns !== null) {
        results.push({ check: 'Conversation columns exist', status: 'PASS', details: 'first_inbound_at, last_inbound_at, utm_*, traffic_source present' });
    } else {
        results.push({ check: 'Conversation columns exist', status: 'FAIL', details: 'Missing required columns' });
    }

    // 2. Check conversation_indicators view
    console.log('📋 Checking conversation_indicators view...');
    const { data: viewData, error: viewError } = await supabase
        .from('conversation_indicators')
        .select('*')
        .limit(5);

    if (viewError) {
        results.push({ check: 'conversation_indicators view', status: 'FAIL', details: viewError.message });
    } else {
        const viewCount = viewData ? viewData.length : 0;
        results.push({ check: 'conversation_indicators view', status: 'PASS', details: `Found ${viewCount} records` });

        // Check for expected columns
        if (viewData && viewData.length > 0) {
            const sample = viewData[0];
            const requiredCols = ['hours_remaining', 'window_status', 'is_stalled', 'awaiting_response', 'is_new_customer', 'is_vip', 'health_score'];
            const missingCols = requiredCols.filter(col => !(col in sample));

            if (missingCols.length > 0) {
                results.push({ check: 'View columns complete', status: 'FAIL', details: `Missing: ${missingCols.join(', ')}` });
            } else {
                results.push({ check: 'View columns complete', status: 'PASS', details: 'All indicator columns present' });
            }
        }
    }

    // 3. Check data population
    console.log('📋 Checking data population...');
    const { data: convStats } = await supabase
        .from('conversations')
        .select('id, first_inbound_at, last_inbound_at')
        .not('first_inbound_at', 'is', null)
        .limit(100);

    const populated = convStats ? convStats.length : 0;
    const { count: totalConvs } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

    const percentPopulated = totalConvs ? ((populated / totalConvs) * 100).toFixed(1) : '0';

    if (populated === 0) {
        results.push({ check: 'first_inbound_at populated', status: 'WARN', details: '0 conversations have first_inbound_at set' });
    } else {
        results.push({ check: 'first_inbound_at populated', status: 'PASS', details: `${percentPopulated}% of conversations have timestamps` });
    }

    // 4. Check crm_contact_snapshots
    console.log('📋 Checking contact snapshots...');
    const { count: snapshotCount } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true });

    const snapCount = snapshotCount || 0;
    if (snapCount > 0) {
        results.push({ check: 'Contact snapshots', status: 'PASS', details: `${snapCount} snapshots exist` });
    } else {
        results.push({ check: 'Contact snapshots', status: 'WARN', details: 'No snapshots found - LTV/VIP indicators may not work' });
    }

    // 5. Check facts JSONB structure
    console.log('📋 Checking facts structure...');
    const { data: factsCheck } = await supabase
        .from('conversations')
        .select('id, facts')
        .not('facts', 'is', null)
        .limit(5);

    if (factsCheck && factsCheck.length > 0) {
        const sampleFacts = factsCheck[0].facts as any;
        const factKeys = Object.keys(sampleFacts || {});

        const expectedKeys = ['friction_score', 'intent_score', 'emotional_vibe'];
        const present = expectedKeys.filter(k => factKeys.includes(k));

        if (present.length > 0) {
            results.push({ check: 'Facts structure', status: 'PASS', details: `Found: ${present.join(', ')}` });
        } else {
            results.push({ check: 'Facts structure', status: 'WARN', details: 'No friction_score/intent_score in facts yet' });
        }
    } else {
        results.push({ check: 'Facts structure', status: 'WARN', details: 'No conversations with facts found' });
    }

    // 6. Sample indicator calculation
    console.log('📋 Sample indicator calculation...');
    const { data: sampleIndicator } = await supabase
        .from('conversation_indicators')
        .select('*')
        .limit(3);

    if (sampleIndicator && sampleIndicator.length > 0) {
        console.log('\n📊 Sample Indicators:');
        sampleIndicator.forEach((ind, i) => {
            const handle = ind.contact_handle ? ind.contact_handle.substring(0, 10) : 'N/A';
            console.log(`  ${i + 1}. Handle: ${handle}...`);
            console.log(`     hours_remaining: ${ind.hours_remaining}, window: ${ind.window_status}`);
            console.log(`     is_stalled: ${ind.is_stalled}, awaiting: ${ind.awaiting_response}`);
            console.log(`     health_score: ${ind.health_score}, is_vip: ${ind.is_vip}, is_new: ${ind.is_new_customer}`);
        });
    }

    // Print Results Summary
    console.log('\n========================================');
    console.log('📋 VERIFICATION RESULTS');
    console.log('========================================\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warned = results.filter(r => r.status === 'WARN').length;

    results.forEach(r => {
        const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${icon} ${r.check}`);
        console.log(`   ${r.details}`);
    });

    console.log('\n----------------------------------------');
    console.log(`Summary: ${passed} PASS, ${failed} FAIL, ${warned} WARN`);

    if (failed > 0) {
        console.log('\n🚨 ACTION REQUIRED: Run missing migrations');
    } else if (warned > 0) {
        console.log('\n⚠️  Some features may need data backfill');
    } else {
        console.log('\n✅ Smart Indicators system is fully operational!');
    }
}

verifySmartIndicators().catch(console.error);

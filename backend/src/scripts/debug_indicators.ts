/**
 * Debug Smart Indicators - Why all showing "Exp." and health_score ~50%
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
    // 0. Check all columns first
    const { data: cols } = await supabase
        .from('crm_columns')
        .select('id, name, position')
        .order('position');

    console.log('=== ALL COLUMNS ===');
    cols?.forEach(c => console.log(`  ${c.position}. ${c.name} -> ${c.id}`));

    // Check specific column conversations
    if (cols && cols.length > 1) {
        const targetCol = cols[1]; // Second column
        console.log(`\n=== CONVERSATIONS IN "${targetCol.name}" ===`);

        const { data: colConvs } = await supabase
            .from('conversations')
            .select('id, contact_handle, last_inbound_at, facts')
            .eq('column_id', targetCol.id)
            .order('last_message_at', { ascending: false })
            .limit(5);

        for (const c of colConvs || []) {
            const facts = c.facts as any;
            console.log(`Handle: ${c.contact_handle}`);
            console.log(`  last_inbound_at: ${c.last_inbound_at}`);
            console.log(`  friction: ${facts?.friction_score} | intent: ${facts?.intent_score}`);

            const { data: ind } = await supabase
                .from('conversation_indicators')
                .select('*')
                .eq('id', c.id)
                .single();

            if (ind) {
                const indData = ind as any;
                console.log(`  => hours_remaining: ${indData.hours_remaining} | window: ${indData.window_status}`);
                console.log(`  => health_score: ${indData.health_score}`);
            }
            console.log('');
        }
    }

    // 1. Check raw conversation data
    const { data: convs } = await supabase
        .from('conversations')
        .select('id, contact_handle, first_inbound_at, last_inbound_at, last_message_at, facts')
        .order('last_message_at', { ascending: false })
        .limit(10);

    console.log('=== RAW CONVERSATIONS (last 10) ===');
    convs?.forEach(c => {
        console.log('Handle:', c.contact_handle?.substring(0, 10));
        console.log('  first_inbound_at:', c.first_inbound_at);
        console.log('  last_inbound_at:', c.last_inbound_at);
        console.log('  last_message_at:', c.last_message_at);
        const facts = c.facts as any;
        console.log('  facts.friction_score:', facts?.friction_score);
        console.log('  facts.intent_score:', facts?.intent_score);
        console.log('');
    });

    // 2. Check indicators view
    const { data: indicators } = await supabase
        .from('conversation_indicators')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(10);

    console.log('=== INDICATORS VIEW (last 10) ===');
    indicators?.forEach((i: any) => {
        console.log('Handle:', i.contact_handle?.substring(0, 10));
        console.log('  hours_remaining:', i.hours_remaining, 'window_status:', i.window_status);
        console.log('  health_score:', i.health_score);
        console.log('  last_inbound_at:', i.last_inbound_at);
        console.log('');
    });

    // 3. Count NULLs
    const { count: totalNull } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .is('last_inbound_at', null);

    const { count: total } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

    console.log('=== STATISTICS ===');
    console.log('Total conversations:', total);
    console.log('With last_inbound_at NULL:', totalNull);
    const pct = ((totalNull || 0) / (total || 1)) * 100;
    console.log('Percentage NULL:', pct.toFixed(1) + '%');

    // 4. Check if we have ANY conversations with recent inbound
    const { data: recentInbound } = await supabase
        .from('conversations')
        .select('contact_handle, last_inbound_at')
        .not('last_inbound_at', 'is', null)
        .gt('last_inbound_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(5);

    console.log('\n=== CONVERSATIONS WITH INBOUND IN LAST 24H ===');
    console.log('Count:', recentInbound?.length || 0);
    recentInbound?.forEach(r => {
        console.log('  ', r.contact_handle?.substring(0, 10), '->', r.last_inbound_at);
    });

    // 5. Check health score calculation inputs
    const { data: factsData } = await supabase
        .from('conversations')
        .select('contact_handle, facts')
        .not('facts', 'is', null)
        .limit(10);

    console.log('\n=== FACTS DATA FOR HEALTH SCORE ===');
    factsData?.forEach(f => {
        const facts = f.facts as any;
        if (facts) {
            console.log('Handle:', f.contact_handle?.substring(0, 10));
            console.log('  friction_score:', facts.friction_score, '| intent_score:', facts.intent_score);
            // Health = ((100 - friction) * intent) / 100
            // Default if no friction: 70 (from migration 056)
            // Default if no intent but has friction: ((100 - friction) * 50) / 100
            const friction = facts.friction_score ?? null;
            const intent = facts.intent_score ?? 50;
            let calculatedHealth = 70; // default
            if (friction !== null) {
                calculatedHealth = ((100 - friction) * intent) / 100;
            } else if (facts.intent_score !== undefined) {
                calculatedHealth = facts.intent_score;
            }
            console.log('  Calculated health:', Math.round(calculatedHealth));
        }
    });
}

debug().catch(console.error);

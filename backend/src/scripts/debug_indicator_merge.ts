/**
 * Debug why indicators are not being merged in getConversations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    // Get conversations
    const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .in('status', ['active', 'review', 'paused'])
        .neq('status', 'archived')
        .order('last_message_at', { ascending: false })
        .limit(5);

    console.log('Conversations found:', convs?.length);
    console.log('IDs:', convs?.map(c => c.id));

    // Now fetch indicators for these IDs
    if (convs && convs.length > 0) {
        const ids = convs.map(c => c.id);
        const { data: indicators, error } = await supabase
            .from('conversation_indicators')
            .select('*')
            .in('id', ids);

        console.log('\nIndicators found:', indicators?.length);
        console.log('Error:', error);

        if (indicators && indicators.length > 0) {
            console.log('\nSample indicator:');
            console.log(JSON.stringify(indicators[0], null, 2));
        }

        // Build map
        const indicatorMap: any = {};
        (indicators || []).forEach((i: any) => {
            indicatorMap[i.id] = i;
        });

        console.log('\nIndicatorMap keys:', Object.keys(indicatorMap).length);

        // Test merge
        const first = convs[0];
        console.log('\nFirst conv ID:', first.id);
        console.log('Indicator for it:', indicatorMap[first.id] ? 'FOUND' : 'MISSING');

        if (indicatorMap[first.id]) {
            console.log('Merged result would have:');
            console.log('  hours_remaining:', indicatorMap[first.id].hours_remaining);
            console.log('  window_status:', indicatorMap[first.id].window_status);
            console.log('  health_score:', indicatorMap[first.id].health_score);
        }
    }
}

test().catch(console.error);

/**
 * Check browsing events data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    // 1. Check if browsing_events table exists and has data
    const { count, error } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact', head: true });

    console.log('=== BROWSING_EVENTS TABLE ===');
    console.log('Total events:', count);
    console.log('Error:', error?.message || 'None');

    // 2. Get recent events
    const { data: events } = await supabase
        .from('browsing_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('\n=== RECENT EVENTS ===');
    if (events && events.length > 0) {
        events.forEach((e: any) => {
            console.log(`[${e.event_type}] ${e.handle || 'anonymous'} - ${e.created_at}`);
            console.log('  url:', e.url);
            console.log('  metadata:', JSON.stringify(e.metadata));
        });
    } else {
        console.log('No events found');
    }

    // 3. Check for events with handle
    const { data: clientEvents } = await supabase
        .from('browsing_events')
        .select('*')
        .not('handle', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\n=== EVENTS WITH HANDLE ===');
    console.log('Count:', clientEvents?.length || 0);
    clientEvents?.forEach((e: any) => {
        console.log(`  ${e.handle} -> ${e.event_type}`);
    });

    // 4. Check distinct event types
    const { data: types } = await supabase
        .from('browsing_events')
        .select('event_type')
        .limit(1000);

    const uniqueTypes = [...new Set(types?.map(t => t.event_type) || [])];
    console.log('\n=== EVENT TYPES ===');
    console.log('Unique types:', uniqueTypes);
}

check().catch(console.error);

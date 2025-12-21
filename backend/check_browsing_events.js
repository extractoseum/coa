
const { supabase } = require('./dist/config/supabase');

async function checkEvents() {
    console.log('--- Checking Browsing Events ---');
    const { data: events, error } = await supabase
        .from('browsing_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!events || events.length === 0) {
        console.log('No events found in browsing_events.');
    } else {
        console.table(events.map(e => ({
            id: e.id,
            handle: e.handle,
            client_id: e.client_id,
            event: e.event_type,
            url: e.url?.substring(0, 30),
            created: e.created_at
        })));
    }
}

checkEvents().catch(console.error);

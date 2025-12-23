import { supabase } from '../src/config/supabase';

async function checkRecentAlerts() {
    console.log('--- FINAL ALERT NETWORK VERIFICATION ---');
    const { data, error } = await supabase
        .from('system_logs')
        .select('created_at, event_type, payload, client_id')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No recent logs found.');
        return;
    }

    data.forEach(log => {
        console.log(`[${log.created_at}] Event: ${log.event_type}`);
        console.log('Payload:', JSON.stringify(log.payload, null, 2));
        console.log('------------------------------');
    });
}

checkRecentAlerts();

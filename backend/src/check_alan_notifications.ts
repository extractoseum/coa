import { supabase } from './config/supabase';

async function checkSentNotifications() {
    const clientId = '72ed1137-7ad6-495b-8182-fc967166c440'; // Alan Martinez
    console.log(`Checking notifications for client ${clientId}...`);

    const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Found ${logs.length} logs.`);
        logs.forEach(log => {
            console.log(`[${log.created_at}] ${log.event_type}: ${JSON.stringify(log.payload)}`);
        });
    }
}

checkSentNotifications();

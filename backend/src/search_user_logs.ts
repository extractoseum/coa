import { supabase } from './config/supabase';

async function searchUserLogs() {
    const email = 'erick@necte.mx';
    console.log(`Searching for any logs related to ${email}...`);

    const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .or(`payload->>email.eq.${email},payload->customer->>email.eq.${email}`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Found ${logs.length} logs.`);
        logs.forEach(log => {
            console.log(`[${log.created_at}] ${log.event_type}`);
        });
    }
}

searchUserLogs();

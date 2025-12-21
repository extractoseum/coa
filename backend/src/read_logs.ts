import { supabase } from './config/supabase';

async function readLogs() {
    console.log('Reading last 10 logs from system_logs...');
    const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching logs:', error.message);
    } else {
        console.log('Recent Logs:', JSON.stringify(logs, null, 2));
    }
}

readLogs();

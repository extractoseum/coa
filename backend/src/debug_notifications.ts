import { supabase } from './config/supabase';

async function checkLogs() {
    const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching logs:', error);
    } else {
        console.log('Recent Logs:', JSON.stringify(data, null, 2));
    }

    const { data: client } = await supabase
        .from('clients')
        .select('id, email, onesignal_player_id, phone')
        .eq('email', 'bdelatorre8@gmail.com')
        .single();

    console.log('Client Data:', client);
}

checkLogs();

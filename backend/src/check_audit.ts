import { supabase } from './config/supabase';

async function checkAuditTable() {
    console.log('Checking system_logs table...');
    const { data, error, count } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('System logs table check failed:', error.message);
    } else {
        console.log('System logs table exists! Rows:', count);
    }
}

checkAuditTable();

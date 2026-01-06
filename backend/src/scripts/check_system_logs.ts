/**
 * Check system_logs table
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    console.log('Checking system_logs table...\n');

    const { count } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true });

    console.log(`Total entries in system_logs: ${count}`);

    const { data: recent } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\nLast 5 entries:');
    recent?.forEach((r, i) => {
        console.log(`${i+1}. [${r.created_at}] ${r.category}/${r.event_type} - ${r.severity}`);
    });
}

check().catch(console.error);

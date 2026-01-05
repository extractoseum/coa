import { supabase } from '../config/supabase';

async function verifyLearning() {
    console.log('🔍 Checking for recent system learning logs...');
    
    const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .eq('event_type', 'inquiry_resolution')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('❌ Error fetching system_logs:', error.message);
        return;
    }

    if (!logs || logs.length === 0) {
        console.log('⚠️ No inquiry resolution logs found yet.');
        return;
    }

    console.log('✅ Found recent learning logs:');
    logs.forEach(log => {
        console.log(`- [${log.created_at}] ${log.message}`);
        console.log(`  Context: ${JSON.stringify(log.metadata?.learning_context || {})}`);
    });
}

verifyLearning();

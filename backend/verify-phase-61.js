const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
    console.log('=== Phase 61 Verification ===\n');

    // 1. Check Indicators View
    console.log('1. Checking conversation_indicators view...');
    const { data: indicators, error: indError } = await supabase
        .from('conversation_indicators')
        .select('*')
        .limit(3);

    if (indError) {
        console.error('❌ View check failed:', indError.message);
    } else {
        console.log('✅ View check successful. Samples:', indicators.length);
        console.table(indicators.map(i => ({
            handle: i.contact_handle,
            hours: i.hours_remaining,
            status: i.window_status,
            health: i.health_score,
            stalled: i.is_stalled
        })));
    }

    // 2. Check Audit Logs (Wait a bit for buffer flush if we triggered any)
    console.log('\n2. Checking crm_audit_logs...');
    const { data: logs, error: logError } = await supabase
        .from('crm_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (logError) {
        console.error('❌ Audit logs check failed:', logError.message);
    } else {
        console.log('✅ Audit logs check successful. Recent logs:', logs.length);
    }

    // 3. Verify interaction timestamps on a conversation
    console.log('\n3. Checking interaction timestamps on conversations...');
    const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('id, contact_handle, first_inbound_at, last_inbound_at')
        .not('last_inbound_at', 'is', null)
        .limit(1);

    if (convError) {
        console.error('❌ Interaction check failed:', convError.message);
    } else if (convs && convs.length > 0) {
        console.log('✅ Interaction timestamps found:', convs[0]);
    } else {
        console.log('ℹ️ No interaction timestamps found yet (normal if no new messages received).');
    }
}

verify();

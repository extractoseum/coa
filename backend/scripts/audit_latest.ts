
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/config/supabase';

async function auditLatest() {
    console.log('--- AUDITING LATEST CALL ---');

    // Get latest call
    const { data: calls } = await supabase
        .from('voice_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!calls || calls.length === 0) {
        console.log('❌ No calls found');
        return;
    }

    const call = calls[0];
    console.log(`✅ Latest Call ID: ${call.vapi_call_id}`);
    console.log(`   Internal ID: ${call.id}`);
    console.log(`   Status: ${call.status}`);
    console.log(`   Date: ${call.created_at}`);

    // Get tool logs
    const { data: logs } = await supabase
        .from('vapi_tool_logs')
        .select('*')
        .eq('vapi_call_id', call.vapi_call_id)
        .order('created_at', { ascending: true });

    if (logs && logs.length > 0) {
        logs.forEach((l: any) => {
            console.log(`\n[Tool] ${l.tool_name}`);
            console.log(`   Args: ${JSON.stringify(l.arguments)}`);
            console.log(`   ArgsRaw: ${l.arguments || 'N/A'}`); // The field might be arguments_raw in DB but arguments in JSON? 
            // Wait, migration schema says `arguments_raw TEXT`.
            // But supabase types?
            console.log(`   ArgsRaw Column: ${l.arguments_raw}`);
            console.log(`   Success: ${l.success}`);
            const summary = l.result_summary || JSON.stringify(l.result) || '';
            console.log(`   Result: ${summary.substring(0, 300)}...`);
        });
    } else {
        console.log('❌ No tool logs found for this call.');
    }
}

auditLatest();

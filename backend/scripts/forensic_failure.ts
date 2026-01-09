
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/config/supabase';

async function forensicAnalysis() {
    const CALL_ID = '019ba420-7cbc-7999-af23-faade1f84f76';
    console.log(`--- FORENSIC ANALYSIS FOR CALL ${CALL_ID} ---`);

    // 1. Check Voice Call Record
    const { data: call, error: callError } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('vapi_call_id', CALL_ID)
        .maybeSingle();

    if (call) {
        console.log('✅ Call Record Found:');
        console.log(`   ID: ${call.id}`);
        console.log(`   Status: ${call.status}`);
        console.log(`   Started: ${call.started_at}`);
        console.log(`   Ended: ${call.ended_at}`);
        console.log(`   Summary: ${call.summary}`);
    } else {
        console.log('❌ Call Record NOT Found (Inbound logging might have failed or invalid ID)');
        if (callError) console.log('   Error:', callError.message);
    }

    // 2. Check Tool Logs
    const { data: logs, error: logError } = await supabase
        .from('vapi_tool_logs')
        .select('*')
        .eq('vapi_call_id', CALL_ID)
        .order('created_at', { ascending: true });

    if (logs && logs.length > 0) {
        console.log(`\n✅ Found ${logs.length} Tool Logs:`);
        logs.forEach(l => {
            console.log(`   [${l.created_at}] ${l.tool_name}:`);
            console.log(`      Args: ${JSON.stringify(l.arguments)}`);
            console.log(`      Error: ${l.to_agent_error || 'None'}`);
            const summary = l.result_summary || '';
            console.log(`      Res Len: ${summary.length}`);
            if (summary.length < 200) console.log(`      Res Preview: ${summary}`);
        });
    } else {
        console.log('\n❌ No Tool Logs Found. The AI likely did not attempt to call any tools.');
    }

    // 3. Check for System/Runtime Errors during that window
    // (This assumes we have a general error log, if not, we rely on the above)
}

forensicAnalysis();

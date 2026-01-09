
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/config/supabase';

async function monitorLive() {
    console.log('--- 📡 LISTENING FOR NEW CALLS ---');
    console.log('Waiting for a new call to appear in voice_calls...');

    const startTime = new Date().toISOString();
    let lastCallId: string | null = null;

    // Poll every 2 seconds
    setInterval(async () => {
        // 1. Check for new call
        if (!lastCallId) {
            const { data: calls } = await supabase
                .from('voice_calls')
                .select('*')
                .gt('created_at', startTime) // Only new calls
                .order('created_at', { ascending: false })
                .limit(1);

            if (calls && calls.length > 0) {
                const call = calls[0];
                lastCallId = call.vapi_call_id;
                console.log(`\n🎉 NEW CALL DETECTED!`);
                console.log(`   ID: ${call.vapi_call_id}`);
                console.log(`   Phone: ${call.phone_number}`);
                console.log(`   Direction: ${call.direction}`);
                console.log(`   Status: ${call.status}`);
                console.log('   --- Monitoring Tool Logs ---');
            }
        }

        // 2. If call found, check for tool logs
        if (lastCallId) {
            const { data: logs } = await supabase
                .from('vapi_tool_logs')
                .select('*')
                .eq('vapi_call_id', lastCallId)
                .order('created_at', { ascending: true });

            if (logs && logs.length > 0) {
                // Determine which logs are new (simple dedup by printing all for now is noisy, better to track index)
                // For simplicity in this script, just print count or last one.
                // Actually, let's just print the last one if it changed.
            }
            // Better: just poll recent logs globally relevant to this call
        }
    }, 2000);

    // Watch tool logs stream
    const channel = supabase
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'vapi_tool_logs',
            },
            (payload) => {
                if (lastCallId && payload.new.vapi_call_id === lastCallId) {
                    const tool = payload.new.tool_name;
                    const error = payload.new.to_agent_error;
                    const success = !error;
                    console.log(`   🛠️  ${tool}: ${success ? '✅ Success' : '❌ Failed'}`);
                    if (!success) console.log(`      Error: ${error}`);
                    if (tool === 'search_products') console.log(`      Res: ${(payload.new.result_summary || '').substring(0, 100)}...`);
                }
            }
        )
        .subscribe();
}

monitorLive();


import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/config/supabase';

async function checkCall() {
    const callId = "019ba3e5-1e2f-7eeb-a07f-f291c9e3e20b";

    console.log(`Checking Voice Call: ${callId}`);
    const { data: call, error } = await supabase.from("voice_calls").select("*").eq("vapi_call_id", callId).maybeSingle();

    if (error) console.error("Error fetching call:", error);
    console.log("Call Data:", call);

    console.log("\nChecking Tool Logs:");
    const { data: logs, error: lErr } = await supabase.from("vapi_tool_logs").select("*").eq("vapi_call_id", callId);
    if (lErr) console.error("Error fetching logs:", lErr);
    console.log("Tool Logs:", logs);
}

checkCall();


import * as dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import { supabase } from '../src/config/supabase';

async function checkRecentReactions() {
    console.log("🕵️ Checking recent Brain Activity (last 10 events)...\n");

    const { data: events, error } = await supabase
        .from('browsing_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("❌ Error fetching events:", error);
        return;
    }

    if (!events || events.length === 0) {
        console.log("⚠️ No recent events found.");
        return;
    }

    events.forEach(e => {
        const time = new Date(e.created_at).toLocaleTimeString();
        if (e.event_type === 'system_reaction') {
            const meta = e.metadata;
            console.log(`🤖 [${time}] REACTION GENERATED for ${e.handle}`);
            console.log(`   Trigger: ${meta.trigger_event}`);
            console.log(`   Product Context Used: ${JSON.stringify(meta.product_context || "N/A").substring(0, 50)}...`);
            console.log(`   🗣️  Message: "${meta.generated_message}"`);
            console.log("   ------------------------------------------------");
        } else {
            console.log(`📡 [${time}] EVENT: ${e.event_type} (${e.handle || 'Anon'})`);
            console.log(`   Data: ${JSON.stringify(e.metadata).substring(0, 100)}...`);
        }
    });
}

checkRecentReactions();


import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { supabase } from '../config/supabase';

async function main() {
    console.log('--- FIND ACTIVE CHANNEL ID ---');

    // 1. Get recent conversations to see what channel_id is being used
    // We look for the one with the user 527481059582 or just recent WA ones
    // 1. Get recent inbound messages to see raw payload
    const { data: msgs, error } = await supabase
        .from('crm_messages')
        .select('id, direction, raw_payload, created_at')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    console.log('Recent Messages (Payload Inspection):');
    msgs.forEach((m: any) => {
        const payload = m.raw_payload || {};
        const channelId = payload.channel_id || 'NOT_FOUND_AT_ROOT';
        const nestedChan = payload.message?.channel_id || 'NOT_FOUND_NESTED';
        console.log(`Msg ${m.id} (${m.created_at}): RootChannel=${channelId}, NestedChannel=${nestedChan}`);
        // Log full payload if needed, but keep it brief for now
        if (channelId !== 'NOT_FOUND_AT_ROOT') console.log('Potential ID:', channelId);
    });

    // 2. Check current channel chips
    const { data: chips, error: chipsError } = await supabase
        .from('channel_chips')
        .select('*');

    if (chipsError) {
        console.error('Error fetching chips:', chipsError);
        return;
    }

    console.log('Current Channel Chips:', JSON.stringify(chips, null, 2));

    console.log('--- END ANALYSIS ---');
}

main();

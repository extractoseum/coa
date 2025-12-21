
const { supabase } = require('./dist/config/supabase');

async function syncSummaries() {
    console.log('--- Starting Conversation Summary Sync ---');

    // 1. Get all active/review/paused conversations
    const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('id, contact_handle')
        .in('status', ['active', 'review', 'paused']);

    if (convError) {
        console.error('Failed to fetch conversations:', convError);
        return;
    }

    console.log(`Processing ${convs.length} conversations...`);

    for (const conv of convs) {
        // 2. Get the last message for this conversation
        const { data: messages, error: msgError } = await supabase
            .from('crm_messages')
            .select('content')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (msgError) {
            console.error(`Failed to fetch messages for ${conv.id}:`, msgError.message);
            continue;
        }

        if (messages && messages.length > 0) {
            const lastMsg = messages[0].content;
            const summary = lastMsg.substring(0, 160);

            // 3. Update conversation
            const { error: updateError } = await supabase
                .from('conversations')
                .update({ summary })
                .eq('id', conv.id);

            if (updateError) {
                console.error(`Failed to update summary for ${conv.id}:`, updateError.message);
            } else {
                console.log(`Updated summary for ${conv.contact_handle}: "${summary.substring(0, 30)}..."`);
            }
        } else {
            console.log(`No messages found for ${conv.contact_handle}. Skipping.`);
        }
    }

    console.log('--- Sync Complete ---');
}

syncSummaries().catch(console.error);

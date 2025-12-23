
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/var/www/coa-viewer/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    console.log('Searching for message "Test_8484848"...');

    // 1. Find the message
    const { data: msgs, error } = await supabase
        .from('crm_messages')
        .select('*')
        .ilike('content', '%Test_8484848%');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Found messages:', msgs.length);
    msgs.forEach(m => {
        console.log('------------------------------------------------');
        console.log(JSON.stringify(m, null, 2));
        console.log('------------------------------------------------');
    });

    // 2. Also check messages for the contact 3327177432 to see if there are stickers
    console.log('\nChecking last 5 messages for conversation with handle 3327177432...');

    // First get conversation id
    const { data: conv } = await supabase.from('conversations').select('id').eq('contact_handle', '3327177432').maybeSingle();

    if (conv) {
        const { data: lastMsgs } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(5);

        console.log('Last 5 messages:');
        lastMsgs.forEach(m => {
            console.log(`[${m.created_at}] Type: ${m.message_type} | Content: "${m.content}" | ID: ${m.id}`);
        });
    } else {
        console.log('Conversation not found for 3327177432');
    }
}

inspect();


import { supabase } from '../src/config/supabase';

async function listHandles() {
    console.log('--- LISTING ALL CONVERSATION HANDLES ---');

    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, contact_handle, contact_name, channel');

    if (error) {
        console.error('Error fetching conversations:', error.message);
        return;
    }

    if (!convs || convs.length === 0) {
        console.log('No conversations found in DB.');
        return;
    }

    convs.forEach(c => {
        console.log(`[${c.channel}] Handle: "${c.contact_handle}" | Name: "${c.contact_name || 'NULL'}"`);
    });
}

listHandles();

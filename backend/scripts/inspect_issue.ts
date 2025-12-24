
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    const PHONE = '4941301513';

    console.log(`\n--- Inspeccionando Contacto: ${PHONE} ---`);
    const { data: contact, error: cErr } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .or(`handle.eq.${PHONE},handle.eq.52${PHONE},handle.eq.521${PHONE},handle.eq.+521${PHONE}`)
        .limit(1);

    if (cErr) console.error('Contact Error:', cErr);
    else console.log('Contact Record:', JSON.stringify(contact, null, 2));

    console.log(`\n--- Inspeccionando Mensajes Recientes ---`);
    // Find conversation first just in case, or query by phone
    // Assuming crm_messages are linked by connection_id or phone? 
    // Let's search inside the 'conversations' table or 'crm_messages'

    // First find conversation id
    const { data: conv } = await supabase
        .from('conversations')
        .select('id, contact_handle, channel')
        .or(`contact_handle.eq.${PHONE},contact_handle.eq.52${PHONE},contact_handle.eq.521${PHONE},contact_handle.eq.+521${PHONE}`)
        .single();

    if (conv) {
        console.log('Conversation ID:', conv.id);
        const { data: msgs } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(5);

        console.log('Last 5 Messages:', JSON.stringify(msgs, null, 2));
    } else {
        console.log('No conversation found for this phone.');
    }
}

run();

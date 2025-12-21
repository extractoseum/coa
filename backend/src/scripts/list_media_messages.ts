
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listMedia() {
    console.log('--- BUSCANDO MENSAJES RECIENTES ---');
    const { data, error } = await supabase
        .from('crm_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error fetching media messages:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No se encontraron mensajes multimedia.');
        return;
    }

    data.forEach(msg => {
        console.log(`[${msg.created_at}] ID: ${msg.id} | Tipo: ${msg.message_type} | Content: ${msg.content}`);
        if (msg.message_type === 'image' || msg.message_type === 'file' || msg.message_type === 'audio') {
            console.log('Raw Payload (part):', JSON.stringify(msg.raw_payload).substring(0, 300));
        }
    });
}

listMedia();

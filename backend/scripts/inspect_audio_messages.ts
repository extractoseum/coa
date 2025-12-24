
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log('--- Resumen de últimos Mensajes de Audio ---');
    const { data: messages, error } = await supabase
        .from('crm_messages')
        .select('id, conversation_id, direction, role, content, external_id, created_at')
        .filter('message_type', 'eq', 'audio')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    messages.forEach(m => {
        const hasTranscript = m.content.includes('Transcripción');
        console.log(`[${m.created_at}] ID: ${m.id} | Role: ${m.role} | Dir: ${m.direction} | Ext: ${m.external_id}`);
        console.log(`   HasTranscript: ${hasTranscript}`);
        console.log(`   Content: ${m.content.substring(0, 200)}...`);
        console.log('---');
    });
}

main();

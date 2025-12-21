
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function search() {
    console.log('--- BUSCANDO 77777 ---');
    const { data, error } = await supabase
        .from('crm_messages')
        .select('id, content, conversation_id, direction, created_at')
        .ilike('content', '%77777%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    data?.forEach(m => {
        console.log(`[${m.created_at}] ID: ${m.id} | Conv: ${m.conversation_id} | Dir: ${m.direction} | Content: ${m.content}`);
    });
}

search();

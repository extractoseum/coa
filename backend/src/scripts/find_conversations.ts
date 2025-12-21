
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findConversations() {
    const handlePart = '3327177432';
    console.log(`--- BUSCANDO CONVERSACIONES PARA: ${handlePart} ---`);
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .ilike('contact_handle', `%${handlePart}%`);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No se encontraron conversaciones.');
        return;
    }

    data.forEach(c => {
        console.log(`ID: ${c.id} | Handle: ${c.contact_handle} | Column: ${c.column_id}`);
    });
}

findConversations();

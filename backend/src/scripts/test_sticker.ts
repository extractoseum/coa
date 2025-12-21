
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSticker() {
    const { data, error } = await supabase.from('crm_messages').insert({
        conversation_id: '32fa3a3c-1370-4bd3-9bf2-fae593f64842',
        direction: 'inbound',
        role: 'user',
        message_type: 'sticker',
        content: '[Sticker](https://whapi.cloud/img/banner.png)',
        status: 'delivered'
    }).select();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Sticker inserted successfully:', data);
    }
}

testSticker();

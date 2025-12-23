
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { supabase } from '../config/supabase';

async function main() {
    console.log('--- INSERTING REAL CHANNEL CHIP ---');

    const chipData = {
        channel_id: 'SPRWMN-7HXD9',
        platform: 'whatsapp',
        traffic_source: 'direct', // Assuming direct traffic for main line
        expected_intent: 'ventas',
        default_entry_column_id: 'da57192a-7a32-4e8d-a8ff-6cce77e8300c', // Ventas / Ara
        default_agent_id: 'sales_ara', // Default Sales Agent
        is_active: true,
        ruleset: []
    };

    console.log('Inserting:', chipData);

    const { data, error } = await supabase
        .from('channel_chips')
        .insert(chipData)
        .select('*')
        .single();

    if (error) {
        console.error('Insert Failed:', error);
    } else {
        console.log('Insert Success:', data);
    }
}

main();


import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { supabase } from '../config/supabase';

async function main() {
    console.log('--- FETCH COLUMNS ---');
    const { data: cols, error } = await supabase
        .from('crm_columns')
        .select('id, name, position')
        .order('position', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Columns:', JSON.stringify(cols, null, 2));
}

main();

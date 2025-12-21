
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function list() {
    const { data, error } = await supabase
        .from('crm_columns')
        .select('*');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Columns:', data);
    }
}

list();

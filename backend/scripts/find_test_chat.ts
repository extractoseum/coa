
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_CONV_ID = 'adfd127a-6285-45a0-a69e-7d7dfc6461fa';

async function find() {
    const { data } = await supabase
        .from('conversations')
        .select('contact_handle, contact_name')
        .eq('id', TARGET_CONV_ID)
        .single();

    console.log('Result:', JSON.stringify(data));
}

find();

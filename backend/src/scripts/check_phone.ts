
import path from 'path';
import dotenv from 'dotenv';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';

async function checkPhone() {
    const phone = '3327177432';
    console.log(`Checking for phone: ${phone}`);

    // Check specific number
    const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone')
        .ilike('phone', `%${phone}%`);

    if (error) console.error('Error searching:', error);
    else console.log('Search Result:', data);

    // List samples to see format
    console.log('--- Sample Phone Numbers in DB ---');
    const { data: samples } = await supabase
        .from('clients')
        .select('email, phone')
        .not('phone', 'is', null)
        .limit(10);
    console.log(samples);
}

checkPhone();

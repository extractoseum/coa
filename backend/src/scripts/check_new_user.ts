
import path from 'path';
import dotenv from 'dotenv';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';

async function checkNewUser() {
    const phone = '3327177432';
    console.log(`Checking for user with phone containing: ${phone}`);

    // Check by loose phone match
    const { data: byPhone, error: phoneError } = await supabase
        .from('clients')
        .select('*')
        .ilike('phone', `%${phone}%`);

    console.log('By Phone:', byPhone);

    // Check most recent users
    console.log('--- Last 5 Users Created ---');
    const { data: recent } = await supabase
        .from('clients')
        .select('id, name, email, phone, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(recent);
}

checkNewUser();

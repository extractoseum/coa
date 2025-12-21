
import path from 'path';
import dotenv from 'dotenv';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';

async function checkUser() {
    const email = 'bdelatorre88@hotmail.com';
    console.log(`Checking for user email: ${email}`);

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('email', email);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found user:', data);
    }
}

checkUser();

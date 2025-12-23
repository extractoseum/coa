
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRole() {
    console.log('--- CHECKING USER ROLE ---');
    const email = 'bdelatorre8@gmail.com';

    // Check Client
    const { data: client, error } = await supabase
        .from('clients')
        .select('id, email, role, tags')
        .eq('email', email)
        .single();

    if (error) console.error(error);
    else {
        console.log(`User: ${client.email}`);
        console.log(`Role: ${client.role}`);
        console.log(`Tags: ${client.tags}`);
    }
}

checkRole();

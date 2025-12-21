
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdmins() {
    const targetEmail = 'badlt@extractoseum.com';
    console.log(`Checking specifically for: ${targetEmail}`);

    const { data: exact } = await supabase.from('clients').select('*').eq('email', targetEmail);
    if (exact && exact.length > 0) {
        console.log('✅ Found exact match!');
        console.log(exact);
    } else {
        console.log('❌ No user found with that exact email.');
    }

    console.log('\nList of Admins:');
    const { data: admins } = await supabase.from('clients').select('*').in('role', ['admin', 'super_admin', 'superadmin']);
    admins?.forEach(a => {
        console.log(`- ${a.name} (${a.email}) [${a.role}]`);
    });

    console.log('\nFuzzy search for "badlt":');
    const { data: fuzzy } = await supabase.from('clients').select('*').ilike('email', '%badlt%');
    fuzzy?.forEach(u => {
        console.log(`- ${u.name} (${u.email})`);
    });
}

checkAdmins();

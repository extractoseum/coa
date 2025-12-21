
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanPlaceholders() {
    const pattern = '%@placeholder.com';
    console.log(`Searching for pattern: ${pattern}`);

    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .ilike('email', pattern);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${clients.length} placeholder accounts:`);
    for (const c of clients) {
        console.log(`Deleting ID: ${c.id}, Email: ${c.email}, Name: ${c.name}`);
        const { error: delError } = await supabase.from('clients').delete().eq('id', c.id);
        if (delError) console.error('Delete failed:', delError);
        else console.log('Deleted.');
    }
}

cleanPlaceholders();

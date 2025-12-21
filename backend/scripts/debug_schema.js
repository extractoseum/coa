
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const run = async () => {
    const { data, error } = await supabase.from('clients').select('*').limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data found in clients table, implies table exists but empty.');
        // Try invalid select to get error with columns?
        const { error: err2 } = await supabase.from('clients').select('NON_EXISTENT_COLUMN').limit(1);
        if (err2) console.log('Error hints:', err2.message, err2.hint);
    }
};

run();


const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function patch() {
    console.log('Adding "config" column to channel_chips...');
    const { error } = await supabase.rpc('exec_sql', {
        sql_query: 'ALTER TABLE channel_chips ADD COLUMN IF NOT EXISTS config JSONB DEFAULT \'{}\'::jsonb;'
    });

    if (error) {
        console.error('Error adding column:', error);
        // Fallback: If rpc fails, we might need another way or just hope it was added manually.
    } else {
        console.log('Column added successfully.');
    }
}

patch();

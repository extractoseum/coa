
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanDuplicates() {
    console.log('--- CLEANING DUPLICATE CONVERSATION ---');
    const invalidId = 'd2da3343-e608-4e7d-b39d-624c0491c89d'; // The WA one with email handle

    const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', invalidId);

    if (error) {
        console.error('Error deleting conversation:', error);
    } else {
        console.log(`Successfully deleted invalid conversation: ${invalidId}`);
    }
}

cleanDuplicates();

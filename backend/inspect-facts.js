const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    // The handle 3327177432 was seen in the screenshot
    const { data: conv, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_handle', '3327177432')
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('--- CONVERSATION FACTS ---');
    console.log(JSON.stringify(conv.facts, null, 2));
}

inspect();


import { supabase } from '../config/supabase';

async function findConv() {
    // Search for conversation with handle '529821037191' or by fuzzy match
    const { data, error } = await supabase
        .from('conversations')
        .select('id, contact_handle, facts')
        .or(`contact_handle.ilike.%bdelatorre8%,contact_handle.ilike.%529821037191%`)
        .limit(5);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found convs:', JSON.stringify(data, null, 2));
    }
}

findConv();

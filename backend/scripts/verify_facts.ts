
import { supabase } from '../src/config/supabase';

async function check() {
    const { data } = await supabase.from('conversations').select('facts').eq('contact_handle', '13038159669').single();
    console.log('Current Facts:', JSON.stringify(data?.facts, null, 2));
}
check();

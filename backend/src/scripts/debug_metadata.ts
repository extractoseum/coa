
import { supabase } from '../config/supabase';

async function main() {
    console.log("Checking COA metadata for token: 18439e50");
    const { data: coa, error } = await supabase
        .from('coas')
        .select('metadata')
        .eq('public_token', '18439e50')
        .single();

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Metadata:", JSON.stringify(coa?.metadata, null, 2));
    }
}

main().catch(console.error);

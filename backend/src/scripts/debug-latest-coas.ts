
import { supabase } from '../config/supabase';

async function checkCOAs() {
    console.log("Fetching last 5 COAs...");

    const { data: coas, error } = await supabase
        .from('coas')
        .select('public_token, created_at, pdf_url_original, metadata')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching COAs:", error);
    } else {
        console.log("Recent COAs Found:");
        coas.forEach(c => {
            console.log(`\nToken: ${c.public_token} (Created: ${c.created_at})`);
            console.log(`PDF Original: ${c.pdf_url_original ? 'Yes' : 'No'}`);
            console.log(`Metadata:`, JSON.stringify(c.metadata, null, 2));
        });
    }
}

checkCOAs();

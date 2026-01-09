
import { supabase } from '../src/config/supabase';

async function inspectComestibles() {
    console.log("Searching for 'comestibles' in Supabase...");
    const { data: results } = await supabase
        .from('products')
        .select('title, product_type, description_plain')
        .or('product_type.ilike.%comestibles%,description_plain.ilike.%comestibles%');

    if (results) {
        console.log(`Found ${results.length} results:`);
        results.forEach(p => {
            console.log(`- ${p.title} | Type: ${p.product_type} | Desc: ${p.description_plain?.substring(0, 50)}...`);
        });
    }
}

inspectComestibles();

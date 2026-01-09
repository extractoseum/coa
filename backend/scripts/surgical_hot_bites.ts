
import { supabase } from '../src/config/supabase';

async function surgicalHotBites() {
    console.log("=== Surgical Inspection: Hot Bites ===");
    const { data: results } = await supabase
        .from('products')
        .select('*')
        .ilike('title', '%Hot Bites%');

    if (results?.[0]) {
        const p = results[0];
        console.log(`Title: ${p.title}`);
        console.log(`Type: ${p.product_type}`);
        console.log(`Description: ${p.description_plain}`);
    } else {
        console.log("Hot Bites NOT FOUND in Supabase!");
    }
}

surgicalHotBites();

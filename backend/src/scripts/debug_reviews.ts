
import { supabase } from '../config/supabase';

async function main() {
    console.log("Getting COA ID for token: 18439e50");
    const { data: coa, error: coaError } = await supabase
        .from('coas')
        .select('id, reviews_enabled')
        .eq('public_token', '18439e50')
        .single();

    if (coaError) {
        console.error("COA Error:", coaError);
        return;
    }
    console.log("COA ID:", coa.id);
    console.log("Reviews Enabled:", coa.reviews_enabled);

    console.log("Fetching Reviews...");
    const { data: reviews, error: reviewsError } = await supabase
        .from('coa_reviews')
        .select('*')
        .eq('coa_id', coa.id);

    if (reviewsError) {
        console.error("Reviews Error:", reviewsError); // Maybe table doesn't exist or RLS
    } else {
        console.log("Reviews Found:", reviews.length);
        console.log(JSON.stringify(reviews, null, 2));
    }
}

main().catch(console.error);

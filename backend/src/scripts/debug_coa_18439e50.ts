
import { supabase } from '../config/supabase';

async function main() {
    console.log("Checking COA with token: 18439e50");
    const { data: coa, error } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', '18439e50')
        .single();

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (!coa) {
        console.error("COA not found");
        return;
    }

    console.log("COA Found. ID:", coa.id);
    console.log("Cannabinoids Type:", Array.isArray(coa.cannabinoids) ? "Array" : typeof coa.cannabinoids);

    if (Array.isArray(coa.cannabinoids)) {
        console.log("Cannabinoids Length:", coa.cannabinoids.length);
        if (coa.cannabinoids.length > 0) {
            console.log("First Cannabinoid:", JSON.stringify(coa.cannabinoids[0], null, 2));
            // Check for potential NaN issues
            const invalidPct = coa.cannabinoids.find((c: any) => isNaN(parseFloat(c.result_pct)));
            if (invalidPct) {
                console.error("Found invalid result_pct:", invalidPct);
            } else {
                console.log("All result_pct values are valid numbers.");
            }
        }
    } else {
        console.error("CRITICAL: cannabinoids is NOT an array!", coa.cannabinoids);
    }
}

main().catch(console.error);

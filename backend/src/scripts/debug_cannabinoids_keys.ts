
import { supabase } from '../config/supabase';

async function main() {
    console.log("Checking cannabinoids keys for token: 18439e50");
    const { data: coa, error } = await supabase
        .from('coas')
        .select('cannabinoids')
        .eq('public_token', '18439e50')
        .single();

    if (error) {
        console.error("Error:", error);
    } else {
        if (Array.isArray(coa.cannabinoids) && coa.cannabinoids.length > 0) {
            const keys = Object.keys(coa.cannabinoids[0]);
            console.log("Keys in first cannabinoid:", keys);
            console.log("Sample:", JSON.stringify(coa.cannabinoids[0], null, 2));

            const hasRetention = coa.cannabinoids.some((c: any) => c.retention_time !== undefined);
            console.log("Has retention_time:", hasRetention);
        } else {
            console.log("No cannabinoids or empty array.");
        }
    }
}

main().catch(console.error);

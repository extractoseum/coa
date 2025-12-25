
import { supabase } from '../config/supabase';

async function main() {
    console.log("Checking COA with token: 18439e50");
    const { data: coa, error } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', '18439e50')
        .single();

    if (error || !coa) {
        console.error("Error/Not Found");
        return;
    }

    if (Array.isArray(coa.cannabinoids)) {
        console.log("Cannabinoids Length:", coa.cannabinoids.length);

        coa.cannabinoids.forEach((c: any, index: number) => {
            if (!c.analyte) {
                console.error(`ERROR: Cannabinoid at index ${index} is missing 'analyte'`, c);
            }
            if (!c.result_pct) {
                console.warn(`WARNING: Cannabinoid at index ${index} is missing 'result_pct'`, c);
            }
            // Check for strange analytes that might break regex?
            console.log(`[${index}] Analyte: "${c.analyte}" Pct: ${c.result_pct}`);
        });

    }
}

main().catch(console.error);

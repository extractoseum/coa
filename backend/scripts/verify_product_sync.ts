
import { supabase } from '../src/config/supabase';

async function verifySync() {
    console.log("=== Checking Supabase Product Data ===");

    const productsToCheck = [
        'Sour Extreme Gummies',
        'Hot Bites',
        'Hexahidrocannabinol (HHC)',
        'Gummies'
    ];

    for (const name of productsToCheck) {
        console.log(`\nChecking: "${name}"...`);
        const { data, error } = await supabase
            .from('products')
            .select('id, title, status, variants')
            .ilike('title', `%${name}%`);

        if (error) {
            console.error(`  Error: ${error.message}`);
            continue;
        }

        if (data && data.length > 0) {
            data.forEach(p => {
                const totalStock = (p.variants || []).reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
                console.log(`  [FOUND] Title: "${p.title}" | Status: "${p.status}" | Stock: ${totalStock}`);
            });
        } else {
            console.log(`  [NOT FOUND]`);
        }
    }
}

verifySync();

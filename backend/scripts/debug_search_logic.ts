
import { supabase } from '../src/config/supabase';

// Replicating VapiToolHandlers.ts Fallback Logic
function getFallbackMappings(): Record<string, string[]> {
    return {
        'gomitas': ['comestibles', 'gummies', 'hot bites', 'candy', 'bites', 'sour', 'extreme'],
        'gummies': ['comestibles', 'gummies', 'hot bites', 'candy', 'sour'],
        'hhc': ['hhc', 'hexahidrocannabinol', 'delta'],
        // ... (rest of mappings)
    };
}

async function debugSearch(query: string) {
    console.log(`\n--- Searching for "${query}" ---`);
    const queryLower = query.toLowerCase().trim();

    // 1. Expand Terms
    const fallback = getFallbackMappings();
    let expandedTerms: string[] = [];

    // Check DB mappings first (simulation)
    const { data: dbMappings } = await supabase
        .from('search_term_mappings')
        .select('mapped_terms')
        .eq('search_term', queryLower)
        .eq('is_active', true)
        .maybeSingle();

    if (dbMappings) {
        console.log(`[DB Mapping] Found: ${JSON.stringify(dbMappings.mapped_terms)}`);
        expandedTerms = dbMappings.mapped_terms;
    } else {
        console.log(`[Fallback] Using hardcoded mappings`);
        expandedTerms = fallback[queryLower] || [queryLower];
    }

    console.log(`Expanded Terms: ${JSON.stringify(expandedTerms)}`);

    // 2. Run Search Loop
    let products: any[] = [];

    for (const term of expandedTerms) {
        if (products.length >= 10) break;

        console.log(`   Querying term: "${term}"...`);
        const { data: results, error } = await supabase
            .from('products')
            .select('id, title, status, variants')
            .eq('status', 'active')
            .or(`title.ilike.%${term}%,product_type.ilike.%${term}%,description_plain.ilike.%${term}%`)
            .limit(5);

        if (error) console.error('   Error:', error.message);

        if (results) {
            console.log(`   Found ${results.length} matches.`);
            results.forEach(p => {
                const stock = p.variants?.reduce((s: number, v: any) => s + (v.inventory_quantity || 0), 0);
                console.log(`      - [${p.status}] (Stock: ${stock}) ${p.title}`);
            });
            products = [...products, ...results];
        }
    }

    // Dedupe
    const seen = new Set();
    products = products.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    });

    console.log(`\nTOTAL UNIQUE RESULTS: ${products.length}`);
    products.forEach(p => {
        const stock = p.variants?.reduce((s: number, v: any) => s + (v.inventory_quantity || 0), 0);
        console.log(`   * ${p.title} | Stock: ${stock}`);
    });
}

async function run() {
    await debugSearch('gomitas');
    // await debugSearch('hhc');
}

run();

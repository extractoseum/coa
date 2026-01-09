
import { supabase } from '../src/config/supabase';

async function simulateSearch(query: string) {
    console.log(`\n=== Simulating Search for: "${query}" ===`);
    const queryLower = query.toLowerCase().trim();

    // 1. Literal Query Match (The [PRIORITY PASS] in code)
    console.log(`[Priority Pass] Searching for literal title match: "%${queryLower}%"...`);
    const { data: literalResults } = await supabase
        .from('products')
        .select('id, title, product_type, description_plain, variants, status')
        .eq('status', 'active')
        .ilike('title', `%${queryLower}%`)
        .limit(5);

    let products = literalResults || [];
    console.log(`  Literal matches found: ${products.length}`);
    products.forEach(p => console.log(`   - ${p.title}`));

    // 2. Expansion Terms
    const searchMappings: Record<string, string[]> = {
        'gomitas': ['gummies', 'comestibles', 'sour', 'extreme'],
        'gummies': ['gummies', 'comestibles', 'sour', 'extreme']
    };

    let expandedTerms = searchMappings[queryLower] || [queryLower];
    console.log(`[Expansion] Terms: ${JSON.stringify(expandedTerms)}`);

    // 3. Search Loop
    for (const term of expandedTerms) {
        if (products.length >= 10) break;
        console.log(`[Term Search] "${term}"...`);
        const { data: results } = await supabase
            .from('products')
            .select('id, title, product_type, description_plain, variants, status')
            .eq('status', 'active')
            .or(`title.ilike.%${term}%,product_type.ilike.%${term}%,description_plain.ilike.%${term}%`)
            .limit(10);

        if (results) {
            const existingIds = new Set(products.map(p => p.id));
            const newMatches = results.filter(p => !existingIds.has(p.id));
            console.log(`  Found ${newMatches.length} new matches for "${term}".`);
            products = [...products, ...newMatches];
        }
    }

    // 4. Scoring Logic (Exact mirror of current VapiToolHandlers.ts)
    const scoredProducts = products.map(p => {
        let score = 0;
        const titleLower = p.title.toLowerCase();
        const typeLower = (p.product_type || '').toLowerCase();

        // Literal Query Match (+200, +100)
        if (titleLower.includes(queryLower)) score += 200;
        if (typeLower.includes(queryLower)) score += 100;

        // Expanded Term Match (+50, +20)
        for (const term of expandedTerms) {
            if (titleLower.includes(term)) score += 50;
            if (typeLower.includes(term)) score += 20;
        }

        // 3. Exact HHC product boost
        if (queryLower === 'hhc' && (titleLower === 'hexahidrocannabinol (hhc)' || titleLower.includes('hhc soluble'))) {
            score += 1000;
        }

        // 4. Category Boost (NEW)
        if ((queryLower === 'gomitas' || queryLower === 'gummies' || queryLower === 'comestibles') && typeLower === 'comestibles') {
            score += 500;
        }

        // 5. Anti-Rank: Hot Bites are NOT gomitas
        if ((queryLower === 'gomitas' || queryLower === 'gummies') && titleLower.includes('hot bites')) {
            score -= 2000;
        }

        // 6. Stock Availability (+5)
        const totalStock = (p.variants || []).reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
        if (totalStock > 0) score += 5;

        return { title: p.title, score, stock: totalStock };
    });

    const final = scoredProducts.sort((a, b) => b.score - a.score).slice(0, 5);

    console.log(`\n--- TOP 5 RANKED RESULTS ---`);
    final.forEach((p, i) => {
        console.log(`${i + 1}. [Score: ${p.score}] ${p.title} (Stock: ${p.stock})`);
    });
}

simulateSearch('gomitas');

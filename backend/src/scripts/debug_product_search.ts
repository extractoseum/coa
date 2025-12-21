
import { searchLocalProducts } from '../services/shopifyService';
import { supabase } from '../config/supabase';
import 'dotenv/config';

async function debugProducts() {
    console.log('🧪 Debugging Product Search...');
    const query = "gomitas";
    const queryEn = "gummies";

    // 1. Check total products
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    console.log(`📊 Total products in DB: ${count}`);

    // 2. Search "gomitas"
    console.log(`🔎 Searching for "${query}"...`);
    const resultsEs = await searchLocalProducts(query);
    console.log(`Found ${resultsEs.length} results.`);
    resultsEs.forEach(p => console.log(`- ${p.name}`));

    // 3. Search "gummies"
    console.log(`🔎 Searching for "${queryEn}"...`);
    const resultsEn = await searchLocalProducts(queryEn);
    console.log(`Found ${resultsEn.length} results.`);
    resultsEn.forEach(p => console.log(`- ${p.name}`));
}

debugProducts();

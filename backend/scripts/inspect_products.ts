

import * as dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' }); // Adjust path if needed, usually running from root
import { supabase } from '../src/config/supabase';

async function inspectProducts() {
    console.log("🔍 Inspecting 'products' table...");

    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .limit(5);

    if (error) {
        console.error("❌ Error fetching products:", error);
        return;
    }

    if (!products || products.length === 0) {
        console.log("⚠️ No products found in local DB.");
        return;
    }

    console.log(`✅ Found ${products.length} sample products:\n`);

    products.forEach(p => {
        console.log(`--- ${p.title} ---`);
        console.log(`ID: ${p.id}`);
        console.log(`Type: ${p.product_type}`);
        console.log(`Tags: ${p.tags}`);
        console.log(`Variants: ${JSON.stringify(p.variants).substring(0, 100)}...`);
        console.log("------------------\n");
    });
}

inspectProducts();

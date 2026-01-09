
import { supabase } from '../src/config/supabase';

async function inspectProducts() {
    console.log("Searching for Hot Bites...");

    const { data: products, error } = await supabase
        .from('products')
        .select('id, title, product_type, description_plain')
        .ilike('title', '%Hot Bites%')
        .limit(1);

    if (error) {
        console.error("❌ Error fetching products:", error);
        return;
    }

    if (products?.[0]) {
        console.log('--- Product Info ---');
        console.log('Title:', products[0].title);
        console.log('Type:', products[0].product_type);
        console.log('Desc:', products[0].description_plain);
    } else {
        console.log('Product not found');
    }
}

inspectProducts();

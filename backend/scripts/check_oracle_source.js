
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
    console.log('Checking Data Sources...');

    // 1. Check Profiles
    const { data: profiles } = await supabase
        .from('product_consumption_profiles')
        .select('product_title, shopify_product_id');

    console.log('\n--- Current Profiles in Oracle ---');
    profiles.forEach(p => console.log(`- [${p.shopify_product_id}] ${p.product_title}`));

    // 2. Check Products Table (Source of Truth)
    const { data: products } = await supabase
        .from('products')
        .select('id, title')
        .limit(10);

    console.log('\n--- Sample Products in DB ---');
    if (products && products.length > 0) {
        products.forEach(p => console.log(`- [${p.id}] ${p.title}`));
    } else {
        console.log('No products found in "products" table.');
    }
}

checkData();

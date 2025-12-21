
import dotenv from 'dotenv';
import { TOOL_HANDLERS } from '../services/aiTools';

// Load env vars
dotenv.config();

async function runTest() {
    console.log('🧪 Starting Sales Flow Verification...');

    // 1. Test Product Search
    console.log('\n🔍 Step 1: Searching for "gummies"...');
    const searchResult = await TOOL_HANDLERS.search_products_db({ query: 'gummies' });

    if (searchResult.error) {
        console.error('❌ Search Failed:', searchResult.error);
        return;
    }

    console.log(`✅ Found ${searchResult.count} products.`);

    if (searchResult.count === 0) {
        console.error('❌ No products found. Cannot proceed.');
        return;
    }

    const firstProduct = searchResult.results[0];
    console.log(`📦 Product Selected: ${firstProduct.name}`);

    if (!firstProduct.variants || firstProduct.variants.length === 0) {
        console.error('❌ Product has no variants. Check searchLocalProducts logic!');
        console.log(firstProduct);
        return;
    }

    const variant = firstProduct.variants[0];
    console.log(`🔖 Variant Selected: ${variant.title} (ID: ${variant.id}) - $${variant.price}`);

    // 2. Test Checkout Generation
    console.log('\n💳 Step 2: Creating Checkout Link...');
    const checkoutResult = await TOOL_HANDLERS.create_checkout_link({
        items: [{ variant_id: variant.id, quantity: 1 }]
    });

    if (checkoutResult.error) {
        console.error('❌ Checkout Creation Failed:', checkoutResult.error);
        return;
    }

    if (checkoutResult.invoice_url) {
        console.log('✅ Checkout Link Generated Successfully!');
        console.log('🔗 URL:', checkoutResult.invoice_url);
    } else {
        console.error('❌ No invoice URL returned.');
        console.log(checkoutResult);
    }
}

runTest().catch(console.error);


import dotenv from 'dotenv';
dotenv.config();

import { VapiService } from '../src/services/VapiService';
import { supabase } from '../src/config/supabase';

const vapiService = new VapiService();

async function verifyFixes() {
    const TEST_PHONE = '+524646460202'; // Fer P (Confirmed in DB)
    const TEST_PRODUCT = 'CandyKush';

    console.log(`--- VERIFYING CLIENT & ORDER LOOKUP FOR ${TEST_PHONE} ---`);
    // This calls internal logic which now uses "last 10 digit" matching and "email/phone" order join
    const context = await vapiService.buildContextForPhone(TEST_PHONE);

    if (context.client) {
        console.log('✅ Client Found:', context.client.name);
        console.log('Client ID:', context.client.client_id);
        console.log('Orders Found:', context.client.total_orders);
        console.log('Last Order:', JSON.stringify(context.client.last_order, null, 2));
        console.log('LTV:', context.client.ltv);
    } else {
        console.log('❌ Client STILL NOT FOUND');
    }

    console.log('\n--- VERIFYING PRODUCT DESCRIPTION CLEANING ---');
    // We can't easily call handleToolCall directly without mocking, but we can check the logic via manual query + regex
    const { data: products } = await supabase
        .from('products')
        .select('description_plain')
        .ilike('title', `%${TEST_PRODUCT}%`)
        .limit(1);

    if (products && products.length > 0) {
        let raw = products[0].description_plain || '';
        console.log(`Original Length: ${raw.length}`);

        // Exact logic from VapiToolHandlers
        let cleanDesc = raw;
        cleanDesc = cleanDesc.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        cleanDesc = cleanDesc.replace(/<[^>]+>/g, '');
        cleanDesc = cleanDesc.replace(/[^{}]+{[^}]*}/g, '');
        cleanDesc = cleanDesc.replace(/[{}]/g, '');
        cleanDesc = cleanDesc.replace(/\s+/g, ' ').trim();
        cleanDesc = cleanDesc.substring(0, 300);

        console.log('Cleaned Description (Preview):');
        console.log(cleanDesc);

        if (cleanDesc.includes('.cannabis-minimal') || cleanDesc.includes('{') || cleanDesc.length > 300) {
            console.log('❌ CSS artifacts still present or too long');
        } else {
            console.log('✅ Description clean and readable');
        }
    } else {
        console.log('⚠️ Product not found for cleaning test');
    }
}

verifyFixes();

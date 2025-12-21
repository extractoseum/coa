
import { getShopifyCustomerByEmail } from '../services/shopifyService';

async function debugEnv() {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const key = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

    console.log('Domain:', domain ? domain.replace(/[a-z0-9]/g, '*') + ` (Length: ${domain.length})` : 'Missing');
    // Reveal first/last chars for format check
    console.log('Domain First/Last:', domain ? `${domain[0]}...${domain[domain.length - 1]}` : 'N/A');
    console.log('Key:', key ? key.substring(0, 4) + '...' : 'Missing');

    // Test simple fetch
    try {
        await getShopifyCustomerByEmail('test');
    } catch (e: any) {
        console.log('Detailed Error:', e.message);
        if (e.response) {
            console.log('Response Status:', e.response.status);
            console.log('Response Data:', JSON.stringify(e.response.data));
        }
    }
}

debugEnv();

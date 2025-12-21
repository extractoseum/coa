import { searchShopifyCustomers } from '../services/shopifyService';

async function debugDianaShopify() {
    const handle = '523325794608';
    console.log(`--- Debugging Shopify Data for ${handle} ---`);

    const results = await searchShopifyCustomers(`phone:${handle}`);
    if (results.length > 0) {
        const customer = results[0] as any;
        console.log('Customer Found:', JSON.stringify(customer, null, 2));
        console.log('Phone Field:', customer.phone);
        console.log('Default Address Phone:', customer.default_address?.phone);
    } else {
        console.log('No customer found in Shopify check.');
    }
}

debugDianaShopify();

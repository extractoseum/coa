
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { searchShopifyCustomerByPhone, isShopifyConfigured, getShopifyCustomerOrders } from '../services/shopifyService';

async function main() {
    console.log('--- DIAGNOSTIC START ---');
    console.log('Checking configuration...');
    const configured = isShopifyConfigured();
    console.log(`Shopify Configured: ${configured}`);

    if (!configured) {
        console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_ACCESS_TOKEN');
        return;
    }

    const targetPhone = '7481059582';
    console.log(`Searching for phone: ${targetPhone}...`);

    try {
        const customers = await searchShopifyCustomerByPhone(targetPhone);
        console.log(`Found ${customers.length} customers.`);
        if (customers.length > 0) {
            console.log('First match:', JSON.stringify(customers[0], null, 2));
            const customerId = customers[0].id;

            console.log(`Fetching orders for Customer ID: ${customerId}...`);
            const orders = await getShopifyCustomerOrders(customerId);
            console.log(`Found ${orders.length} orders.`);
            if (orders.length > 0) {
                console.log('First order:', JSON.stringify(orders[0], null, 2));
            }
        } else {
            console.log('No customers found.');
        }
    } catch (e: any) {
        console.error('Search/Fetch failed:', e.message);
        if (e.response) {
            console.error('API Error Data:', e.response.data);
        }
    }
    console.log('--- DIAGNOSTIC END ---');
}

main();

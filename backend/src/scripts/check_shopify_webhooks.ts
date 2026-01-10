import 'dotenv/config';
import axios from 'axios';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

async function checkWebhooks() {
    console.log('=== Checking Shopify Webhooks ===\n');
    console.log(`Store: ${SHOPIFY_STORE_DOMAIN}`);

    try {
        const response = await axios.get(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
            { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
        );

        const webhooks = response.data.webhooks;

        console.log(`\nFound ${webhooks.length} webhooks:\n`);

        webhooks.forEach((w: any) => {
            console.log(`Topic: ${w.topic}`);
            console.log(`  Address: ${w.address}`);
            console.log(`  Format: ${w.format}`);
            console.log(`  Created: ${w.created_at}`);
            console.log('');
        });

        // Check which ones are missing
        const expectedTopics = [
            'orders/create',
            'orders/updated',
            'orders/fulfilled',
            'orders/partially_fulfilled',
            'orders/paid',
            'customers/update',
            'checkouts/update'
        ];

        const existingTopics = webhooks.map((w: any) => w.topic);
        const missing = expectedTopics.filter(t => !existingTopics.includes(t));

        if (missing.length > 0) {
            console.log('=== MISSING WEBHOOKS ===');
            missing.forEach(t => console.log(`  - ${t}`));
        }

    } catch (error: any) {
        console.error('Error fetching webhooks:', error.response?.data || error.message);
    }
}

checkWebhooks().then(() => process.exit(0));

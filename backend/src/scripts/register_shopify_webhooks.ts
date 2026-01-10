/**
 * Register Shopify webhooks programmatically
 *
 * Run: npx ts-node src/scripts/register_shopify_webhooks.ts
 */
import 'dotenv/config';
import axios from 'axios';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

// Production backend URL (same domain as frontend, /api routes)
const BACKEND_URL = process.env.BACKEND_URL || 'https://coa.extractoseum.com';

const webhooksToRegister = [
    {
        topic: 'orders/create',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/order-create`
    },
    {
        topic: 'orders/updated',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/order-updated`
    },
    {
        topic: 'orders/fulfilled',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/fulfillment-update`
    },
    {
        topic: 'orders/partially_fulfilled',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/fulfillment-update`
    },
    {
        topic: 'orders/paid',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/order-updated`
    },
    {
        topic: 'customers/update',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/customer-update`
    },
    {
        topic: 'checkouts/update',
        address: `${BACKEND_URL}/api/v1/webhooks/shopify/checkout-update`
    }
];

async function registerWebhooks() {
    console.log('=== Registering Shopify Webhooks ===\n');
    console.log(`Store: ${SHOPIFY_STORE_DOMAIN}`);
    console.log(`Backend: ${BACKEND_URL}\n`);

    for (const webhook of webhooksToRegister) {
        try {
            const response = await axios.post(
                `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
                {
                    webhook: {
                        topic: webhook.topic,
                        address: webhook.address,
                        format: 'json'
                    }
                },
                { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
            );

            console.log(`✅ Registered: ${webhook.topic}`);
            console.log(`   Address: ${webhook.address}`);
            console.log(`   ID: ${response.data.webhook.id}\n`);

        } catch (error: any) {
            const errorMsg = error.response?.data?.errors || error.message;
            console.log(`❌ Failed: ${webhook.topic}`);
            console.log(`   Error: ${JSON.stringify(errorMsg)}\n`);
        }
    }

    // Verify registration
    console.log('\n=== Verifying Registration ===\n');

    const verifyResponse = await axios.get(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN! } }
    );

    console.log(`Total webhooks now registered: ${verifyResponse.data.webhooks.length}`);
}

registerWebhooks().then(() => process.exit(0)).catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});

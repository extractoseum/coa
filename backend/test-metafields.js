// Test script for Shopify metafields
// Run with: node test-metafields.js

require('dotenv').config();
const axios = require('axios');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const shopifyCustomerId = '8900275142828';

async function testMetafields() {
    console.log('\n=== Testing Shopify Metafields ===\n');
    console.log('Store Domain:', SHOPIFY_STORE_DOMAIN);
    console.log('Customer ID:', shopifyCustomerId);
    console.log('API Version:', SHOPIFY_API_VERSION);

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
        console.error('\nERROR: Shopify credentials not configured!');
        return;
    }

    const baseUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

    try {
        // 1. Get customer info
        console.log('\n--- Getting Customer Info ---');
        const customerRes = await axios.get(
            `${baseUrl}/customers/${shopifyCustomerId}.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        const customer = customerRes.data.customer;
        console.log('Name:', customer.first_name, customer.last_name);
        console.log('Email:', customer.email);
        console.log('Phone:', customer.phone);
        console.log('Tags:', customer.tags);
        console.log('Has Club_partner tag:', customer.tags?.toLowerCase().includes('club_partner'));

        // 2. Get metafields
        console.log('\n--- Getting Metafields ---');
        const metafieldsRes = await axios.get(
            `${baseUrl}/customers/${shopifyCustomerId}/metafields.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        const metafields = metafieldsRes.data.metafields || [];
        console.log('Total metafields found:', metafields.length);

        if (metafields.length === 0) {
            console.log('\nNo metafields found. This could mean:');
            console.log('1. The API token does not have read_customers scope');
            console.log('2. The customer has no metafields');
            console.log('3. The metafields are stored differently (check Shopify admin)');
        } else {
            console.log('\n--- Metafields by Namespace ---');
            const grouped = {};
            metafields.forEach(mf => {
                const ns = mf.namespace || 'no_namespace';
                if (!grouped[ns]) grouped[ns] = [];

                // Handle different value types
                let displayValue = mf.value;
                if (typeof displayValue === 'string' && displayValue.length > 100) {
                    displayValue = displayValue.substring(0, 100) + '...';
                } else if (typeof displayValue === 'object') {
                    displayValue = JSON.stringify(displayValue).substring(0, 100) + '...';
                }

                grouped[ns].push({
                    key: mf.key,
                    value: displayValue,
                    type: mf.type
                });
            });

            for (const [namespace, fields] of Object.entries(grouped)) {
                console.log(`\n[${namespace}]`);
                fields.forEach(f => {
                    console.log(`  ${f.key}: ${f.value} (${f.type})`);
                });
            }

            // Print raw metafields for debugging
            console.log('\n--- Raw Metafields (JSON) ---');
            console.log(JSON.stringify(metafields, null, 2));
        }

        // 3. Try alternate endpoints for form data
        console.log('\n--- Checking for Form Submissions ---');
        // Some form data might be in a different location

    } catch (error) {
        console.error('\nError:', error.response?.data || error.message);
        if (error.response?.status === 403) {
            console.log('\nAccess denied. The API token might not have the required scopes.');
            console.log('Required scope: read_customers');
        }
    }
}

testMetafields();

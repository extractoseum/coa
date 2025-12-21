require('dotenv').config();
const axios = require('axios');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

async function checkShopifyCustomer() {
    const customerId = '8763363688620'; // badlt@extractoseum.com
    const baseUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

    try {
        const response = await axios.get(`${baseUrl}/customers/${customerId}.json`, {
            headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        const customer = response.data.customer;
        console.log('Shopify Customer ID:', customerId);
        console.log('Name:', customer.first_name, customer.last_name);
        console.log('Email:', customer.email);
        console.log('Tags:', customer.tags);
        console.log('Tags array:', customer.tags?.split(',').map(t => t.trim()));
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

checkShopifyCustomer();

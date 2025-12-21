
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

async function testShopifyValues() {
    const phoneInput = '3327177432';
    console.log(`Testing Shopify Search for: '${phoneInput}'`);

    const queries = [
        `phone:${phoneInput}`,
        `phone:*${phoneInput}*`,
        `phone:+52${phoneInput}`,
        `${phoneInput}`
    ];

    for (const q of queries) {
        console.log(`\nQuery: '${q}'`);
        try {
            const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/search.json?query=${encodeURIComponent(q)}&fields=id,email,phone,first_name,last_name`;
            const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN || '' } });
            const data: any = await res.json();

            if (data.customers && data.customers.length > 0) {
                console.log('MATCH FOUND!');
                data.customers.forEach((c: any) => console.log(`- ${c.first_name} ${c.last_name} (${c.phone}) [ID: ${c.id}]`));
            } else {
                console.log('No match.');
            }
        } catch (e: any) {
            console.error('Error:', e.message);
        }
    }
}

testShopifyValues();


import { getShopifyCustomerByEmail, getShopifyCustomerOrders } from '../services/shopifyService';

async function checkShopify() {
    const email = 'bdelatorre8@gmail.com';
    console.log(`Checking Shopify for ${email}...`);

    const customer = await getShopifyCustomerByEmail(email);
    if (!customer) {
        console.log('Customer not found in Shopify.');
        return;
    }

    console.log('Customer Found:', customer.id);
    console.log('Tags:', customer.tags);
    console.log('Total Spent:', customer.total_spent);
    console.log('Orders Count:', customer.orders_count);

    const orders = await getShopifyCustomerOrders(customer.id);
    console.log(`Found ${orders.length} orders in Shopify.`);
    if (orders.length > 0) {
        console.log('Last Order:', orders[0].name, orders[0].total_price);
    }
}

checkShopify();

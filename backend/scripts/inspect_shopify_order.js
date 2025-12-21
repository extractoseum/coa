
const { getShopifyOrderById } = require('../dist/services/shopifyService');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
    const orderId = '6993280434348'; // EUM_1325_SHOP
    console.log(`Fetching order ${orderId}...`);
    const order = await getShopifyOrderById(orderId);
    if (!order) {
        console.log('Order not found');
        return;
    }

    console.log('Order Name:', order.name);
    console.log('Fulfillment Status:', order.fulfillment_status);
    console.log('Fulfillments:', JSON.stringify(order.fulfillments, null, 2));
}

main().catch(console.error);

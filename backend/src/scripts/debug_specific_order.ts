
import { getShopifyOrderById } from '../services/shopifyService';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const testOrderId = '6804653670572';

async function main() {
    console.log(`Testing fetch for Order ID: ${testOrderId}`);
    try {
        const order = await getShopifyOrderById(testOrderId);
        console.log('Result:', JSON.stringify(order, null, 2).substring(0, 500) + '...');

        if (!order) {
            console.error('FAILED: Order returned null/undefined');
        } else if (order.line_items) {
            console.log('SUCCESS: Line items found:', order.line_items.length);
        } else {
            console.warn('WARNING: Order found but no line_items:', Object.keys(order));
        }
    } catch (error: any) {
        console.error('CRITICAL ERROR:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data));
        }
    }
}

main();

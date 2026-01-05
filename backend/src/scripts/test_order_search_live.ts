import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { supabase } = require('../config/supabase');
const { TOOL_HANDLERS } = require('../services/aiTools');

async function testSearch() {
    try {
        console.log('--- START TEST ---');
        const { data: orders } = await supabase.from('orders').select('order_number').limit(1);
        
        if (!orders || orders.length === 0) {
            console.log('No orders to test.');
            return;
        }

        const testNum = orders[0].order_number;
        console.log('Testing with:', testNum);
        
        const result = await TOOL_HANDLERS.search_order_by_number({ order_number: testNum });
        console.log('Result Found:', result.found);
        if (result.orders) {
            console.log('Order Example:', result.orders[0].order_number);
        }
        console.log('--- END TEST ---');
    } catch (err: any) {
        console.error('ERROR:', err);
    }
}

testSearch().then(() => process.exit(0));

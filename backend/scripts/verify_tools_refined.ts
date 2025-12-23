import { TOOL_HANDLERS } from '../src/services/aiTools';
import dotenv from 'dotenv';
dotenv.config();

async function verifyTools() {
    console.log('--- Verifying get_active_clients_count_today (Legacy vs Today) ---');
    try {
        const result = await TOOL_HANDLERS.get_active_clients_count_today({});
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log(`Window definition used: ${result.period}`);
        if (result.orders_today === 12 || result.orders_today === 13) {
            console.log('✅ Tool counts match Shopify (12-13)!');
        } else {
            console.log(`❌ Discrepancy remains: ${result.orders_today} vs expected ~12`);
        }
    } catch (e: any) {
        console.error('❌ Tool failed:', e.message);
    }

    console.log('\n--- Verifying get_recent_orders (Aligned) ---');
    try {
        const result = await TOOL_HANDLERS.get_recent_orders({ limit: 1 });
        console.log('Result:', JSON.stringify(result, null, 2));
        if (result.total_count !== undefined && result.orders) {
            console.log('✅ Tool get_recent_orders is working and aligned!');
        } else {
            console.log('❌ Unexpected result format for orders.');
        }
    } catch (e: any) {
        console.error('❌ Tool get_recent_orders failed:', e.message);
    }
}

verifyTools();

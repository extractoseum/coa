
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { ADMIN_TOOLS, TOOL_HANDLERS } from '../src/services/aiTools';

const runDiagnosis = async () => {
    console.log('🔍 Starting AI Tools Diagnosis...');
    console.log('===================================');

    // 1. Check Tool Registration
    console.log(`\n📋 Registered Tools (${ADMIN_TOOLS.length}):`);
    const registeredNames = ADMIN_TOOLS.map(t => t.function.name);
    registeredNames.forEach(name => console.log(`   - ${name}`));

    // 2. Check Handler Implementation
    console.log('\n🛠️  Checking Handlers:');
    const missingHandlers: string[] = [];
    registeredNames.forEach(name => {
        if (TOOL_HANDLERS[name]) {
            // console.log(`   ✅ ${name}`);
        } else {
            console.error(`   ❌ ${name} IS MISSING HANDLER!`);
            missingHandlers.push(name);
        }
    });

    if (missingHandlers.length === 0) {
        console.log('   ✅ All tools have handlers.');
    } else {
        console.error('   ⚠️  MISSING HANDLERS DETECTED!');
    }

    // 3. Test Safe Executions
    console.log('\n🚀 Testing Safe Tools:');

    // Test: check_whatsapp_status
    if (TOOL_HANDLERS['check_whatsapp_status']) {
        console.log('\n[TEST] check_whatsapp_status...');
        try {
            const status = await TOOL_HANDLERS['check_whatsapp_status']({});
            console.log('   Result:', status);
        } catch (e: any) {
            console.error('   Failed:', e.message);
        }
    }

    // Test: get_system_health
    if (TOOL_HANDLERS['get_system_health']) {
        console.log('\n[TEST] get_system_health...');
        try {
            const health = await TOOL_HANDLERS['get_system_health']({});
            console.log('   Result:', health);
        } catch (e: any) {
            console.error('   Failed:', e.message);
        }
    }

    // Test: search_clients (Safe Query)
    if (TOOL_HANDLERS['search_clients']) {
        console.log('\n[TEST] search_clients (query: "test")...');
        try {
            const clients = await TOOL_HANDLERS['search_clients']({ query: 'test' });
            console.log(`   Found ${clients.length} results.`);
        } catch (e: any) {
            console.error('   Failed:', e.message);
        }
    }

    // Test: get_system_insights (Analytics)
    if (TOOL_HANDLERS['get_system_insights']) {
        console.log('\n[TEST] get_system_insights...');
        try {
            const insights = await TOOL_HANDLERS['get_system_insights']({});
            console.log('   Result:', JSON.stringify(insights, null, 2));
        } catch (e: any) {
            console.error('   Failed:', e.message);
        }
    }

    // Test: get_ai_usage_stats (Analytics)
    if (TOOL_HANDLERS['get_ai_usage_stats']) {
        console.log('\n[TEST] get_ai_usage_stats (days: 1)');
        try {
            const stats = await TOOL_HANDLERS['get_ai_usage_stats']({ days: 1 });
            console.log('   Result:', stats);
        } catch (e: any) {
            console.error('   Failed:', e.message);
        }
    }

    // Test: search_coas (Phase 3)
    if (TOOL_HANDLERS['search_coas']) {
        console.log('\n[TEST] search_coas (query: "test")...');
        try {
            const coas = await TOOL_HANDLERS['search_coas']({ query: 'test' });
            console.log('   Result:', Array.isArray(coas) ? `Found ${coas.length}` : coas);
        } catch (e: any) {
            console.error('   Failed:', e.message);
        }
    }

    // Test: get_coa_details (Phase 3)
    if (TOOL_HANDLERS['get_coa_details']) {
        console.log('\n[TEST] get_coa_details (invalid id)...');
        try {
            await TOOL_HANDLERS['get_coa_details']({ coa_id: '00000000-0000-0000-0000-000000000000' });
            console.log('   Result: Handled gracefully');
        } catch (e: any) {
            console.log('   Result: Handled gracefully (DB error expected)');
        }
    }

    console.log('\nDone.');
    process.exit(0);
};

runDiagnosis().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});

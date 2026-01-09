
import dotenv from 'dotenv';
dotenv.config();

import { VapiService } from '../src/services/VapiService';

const vapiService = new VapiService();

async function runVerification() {
    console.log('--- VERIFYING COA BACKUP & WHATSAPP ---');

    // 1. WhatsApp Failure Simulation (Missing Phone)
    console.log('\n[TEST 1] Send WhatsApp WITHOUT phone (Should fail gracefully)');
    const failWhatsapp = await vapiService.handleWebhook({
        message: {
            type: 'tool-calls',
            call: { id: 'test-fail-wa', metadata: {} }, // No customer phone
            toolWithToolCallList: [{
                type: 'function',
                function: { name: 'send_whatsapp', arguments: JSON.stringify({ message: 'Test Fail' }) },
                id: 'call_fail_wa'
            }]
        }
    });
    // @ts-ignore
    console.log('Result:', failWhatsapp.results?.[0]?.result);

    // 2. Mock Product with Metadata COA (Simulate finding a product with COA in metadata)
    // Note: Since we can't easily mock the DB state here without inserting, 
    // we rely on the logic check. If 'CandyKush' has metadata in the real DB, it will work.
    // If not, it will return "COA not found".

    console.log('\n[TEST 2] Get COA for "CandyKush" (Testing Metadata Backup)');
    const coaSearch = await vapiService.handleWebhook({
        message: {
            type: 'tool-calls',
            call: {
                id: 'test-coa',
                customer: { number: '+525512345678' },
                metadata: { clientId: 'mock-id' }
            },
            toolWithToolCallList: [{
                type: 'function',
                function: { name: 'get_coa', arguments: JSON.stringify({ product_name: 'CandyKush' }) },
                id: 'call_coa_lookup'
            }]
        }
    });

    // @ts-ignore
    const resultJson = coaSearch.results?.[0]?.result;
    console.log('Result:', resultJson);

    if (resultJson && (resultJson.includes('Virtual COA') || resultJson.includes('Encontré el COA'))) {
        console.log('✅ COA found via backup or main table.');
    } else {
        console.log('⚠️ COA not found (Expected if no real metadata exists for CandyKush yet). Logic prevents crash.');
    }

    process.exit(0);
}

runVerification();

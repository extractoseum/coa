
import dotenv from 'dotenv';
dotenv.config();

import { VapiService } from '../src/services/VapiService';
import { handleSearchProducts } from '../src/services/VapiToolHandlers';
import { supabase } from '../src/config/supabase';

const vapiService = new VapiService();

async function verifyInboundAndSearch() {
    const TEST_PHONE = '+524646460202'; // Fer P
    const CALL_ID = `sim_inbound_${Date.now()}`;

    console.log('--- 1. VERIFYING INBOUND CALL FLOW ---');
    const webhookPayload = {
        message: {
            type: 'assistant-request',
            call: {
                id: CALL_ID,
                orgId: 'org_test',
                customer: {
                    number: TEST_PHONE
                },
                phoneNumberId: 'phone_test'
            }
        }
    };

    // 1. Simulate Webhook
    console.log('Simulating assistant-request...');
    const response = await vapiService.handleWebhook(webhookPayload);

    // 2. Check DB Insert
    console.log('Checking voice_calls table...');
    const { data: callParams } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('vapi_call_id', CALL_ID)
        .maybeSingle();

    if (callParams) {
        console.log('✅ Inbound call logged successfully:', callParams.id);
        console.log('   Direction:', callParams.direction);
        console.log('   Phone:', callParams.phone_number);
    } else {
        console.error('❌ Inbound call NOT logged in DB');
    }

    // 3. Check Context in Response
    if (response) {
        const sysMsg = response.assistant?.model?.messages?.find((m: any) => m.role === 'system')?.content;
        if (sysMsg && sysMsg.includes('Fernando Torres')) {
            console.log('✅ Context injected correctly (Client Name Found)');
        } else {
            console.log('⚠️ Context might be missing client name. System Msg preview:', sysMsg?.substring(0, 100));
        }
    }

    console.log('\n--- 2. VERIFYING IMPROVED SEARCH ---');

    // Test the specific queries user complained about + the raw variant
    const queries = ['gomitas candy kush', 'caramelos candy kush', 'CandyKush'];

    for (const q of queries) {
        console.log(`\nSearching for: "${q}"`);
        const result = await handleSearchProducts({ query: q }, {
            customerPhone: TEST_PHONE,
            // @ts-ignore
            conversationId: 'sim_conv'
        });

        // Current implementation returns data: { products: [...], count: N }
        if (result.success && result.data?.products) {
            console.log(`Found ${result.data.products.length} products:`);
            result.data.products.forEach((p: any) => {
                console.log(` - ${p.name} ($${p.price})`);
            });

            // Validation
            const names = result.data.products.map((p: any) => p.name.toLowerCase());
            const hasGummies = names.some((t: string) => t.includes('gummies') || t.includes('gomitas'));
            const hasCaramel = names.some((t: string) => t.includes('caramel') || t.includes('caramelos') || t.includes('cream'));

            if (q.includes('gomitas') && hasGummies) console.log('✅ Found Gummies');
            if (q.includes('caramelos') && hasCaramel) console.log('✅ Found Caramel');
        } else {
            console.log('❌ Search failed:', result.error);
        }
    }
}

verifyInboundAndSearch();

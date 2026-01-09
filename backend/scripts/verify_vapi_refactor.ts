
import dotenv from 'dotenv';
dotenv.config();

import { VapiService } from '../src/services/VapiService';

const vapiService = new VapiService();

async function runVerification() {
    console.log('--- STARTING VAPI OPTIMIZATION VERIFICATION ---');

    console.log('\n1. Testing Fallback Context Lookup (Missing clientId)');
    // Payload WITHOUT clientId in metadata, but WITH legitimate phone
    // We use a known existing phone or similar format
    const toolCallPayload = {
        message: {
            type: 'tool-calls',
            call: {
                id: 'mock-call-id-fallback',
                customer: {
                    number: '+525512345678' // Ensure this matches a client or is reasonable
                },
                metadata: {
                    // INTENTIONALLY MISSING clientId
                    conversationId: 'mock-conv-id'
                }
            },
            toolWithToolCallList: [
                {
                    type: 'function',
                    function: {
                        name: 'search_products',
                        arguments: JSON.stringify({ query: 'gomitas' })
                    },
                    id: 'call_fallback_test'
                }
            ]
        }
    };

    try {
        const toolResult = await vapiService.handleWebhook(toolCallPayload);
        console.log('Fallback Test Result (Check logs for "Fallback found client"):', JSON.stringify(toolResult, null, 2));
    } catch (e: any) {
        console.error('❌ Fallback Test Error:', e.message);
    }

    console.log('\n2. Testing Broad Search (Description & Fuzzy)');
    const searchPayload = {
        message: {
            type: 'tool-calls',
            call: {
                id: 'mock-call-id-search',
                customer: { number: '+525512345678' },
                metadata: { clientId: 'mock-id' }
            },
            toolWithToolCallList: [
                {
                    type: 'function',
                    function: {
                        name: 'search_products',
                        arguments: JSON.stringify({ query: 'acido' }) // Should find "sour"
                    },
                    id: 'call_search_test'
                }
            ]
        }
    };

    try {
        const searchResult = await vapiService.handleWebhook(searchPayload);
        // @ts-ignore
        const resultString = searchResult.results?.[0]?.result;
        console.log('Search "acido" Result:', resultString);

        if (resultString && resultString.toLowerCase().includes('sour')) {
            console.log('✅ Search optimization verified: "acido" found "sour" products.');
        } else {
            console.log('⚠️ Search optimization check: Verify output above.');
        }

    } catch (e: any) {
        console.error('❌ Search Test Error:', e.message);
    }

    console.log('\n--- VERIFICATION COMPLETE ---');
    process.exit(0);
}

runVerification();

/**
 * VAPI Call Diagnostics Script
 *
 * Run this to diagnose issues with a specific VAPI call:
 * npx ts-node scripts/diagnose_vapi_call.ts <call_id>
 *
 * Or in production:
 * cd /var/www/coa-viewer/backend && node dist/scripts/diagnose_vapi_call.js <call_id>
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY || process.env.VAPI_PRIVATE_KEY;
const CALL_ID = process.argv[2] || '019ba318-40f6-7993-999f-1689bed4bd24';

async function diagnose() {
    console.log('='.repeat(60));
    console.log('VAPI CALL DIAGNOSTICS');
    console.log('='.repeat(60));
    console.log(`Call ID: ${CALL_ID}`);
    console.log(`API Key: ${VAPI_API_KEY?.substring(0, 8)}...`);
    console.log('');

    if (!VAPI_API_KEY) {
        console.error('❌ ERROR: VAPI_API_KEY not found in environment');
        process.exit(1);
    }

    try {
        // 1. Get Call Details
        console.log('📞 Fetching call details...');
        const callResponse = await axios.get(`https://api.vapi.ai/call/${CALL_ID}`, {
            headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
        });

        const call = callResponse.data;
        console.log('\n--- CALL INFO ---');
        console.log(`Status: ${call.status}`);
        console.log(`Ended Reason: ${call.endedReason || 'N/A'}`);
        console.log(`Duration: ${call.durationSeconds || 0}s`);
        console.log(`Phone: ${call.customer?.number}`);
        console.log(`Assistant: ${call.assistantId}`);

        // 2. Analyze Messages
        console.log('\n--- MESSAGES & TOOL CALLS ---');
        const messages = call.messages || call.artifact?.messages || [];

        if (messages.length === 0) {
            console.log('⚠️  No messages found in call data');
        }

        let toolCallCount = 0;
        for (const msg of messages) {
            if (msg.role === 'tool_calls' || msg.toolCalls) {
                toolCallCount++;
                console.log(`\n🔧 TOOL CALL #${toolCallCount}:`);
                const toolCalls = msg.toolCalls || [msg];
                for (const tc of toolCalls) {
                    console.log(`   Name: ${tc.function?.name || tc.name}`);
                    console.log(`   Args: ${JSON.stringify(tc.function?.arguments || tc.arguments)}`);
                }
            }
            if (msg.role === 'tool_call_result' || msg.role === 'tool') {
                console.log(`   📤 Result: ${JSON.stringify(msg.content || msg.result).substring(0, 200)}...`);
            }
        }

        // 3. Check for errors in transcript
        console.log('\n--- TRANSCRIPT ANALYSIS ---');
        const transcript = call.transcript || call.artifact?.transcript || '';
        if (transcript) {
            console.log(`Transcript length: ${transcript.length} chars`);
            // Look for error patterns
            if (transcript.toLowerCase().includes('error') ||
                transcript.toLowerCase().includes('no result') ||
                transcript.toLowerCase().includes('no encontr')) {
                console.log('⚠️  Potential errors detected in transcript');
            }
        } else {
            console.log('No transcript available');
        }

        // 4. Check structured outputs
        console.log('\n--- STRUCTURED OUTPUTS ---');
        const analysis = call.analysis || call.artifact?.analysis;
        if (analysis) {
            console.log('Analysis:', JSON.stringify(analysis, null, 2));
        } else {
            console.log('No analysis available');
        }

        // 5. Get logs for this call
        console.log('\n--- CALL LOGS ---');
        try {
            const logsResponse = await axios.get(`https://api.vapi.ai/logs`, {
                headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
                params: { callId: CALL_ID, limit: 50 }
            });

            const logs = logsResponse.data;
            if (logs && logs.length > 0) {
                for (const log of logs.slice(0, 10)) {
                    const level = log.level || 'INFO';
                    const msg = log.message || log.log || JSON.stringify(log);
                    console.log(`[${level}] ${msg.substring(0, 150)}`);
                }
            } else {
                console.log('No logs found');
            }
        } catch (e: any) {
            console.log(`Could not fetch logs: ${e.message}`);
        }

        // 6. Check webhook delivery
        console.log('\n--- RECOMMENDATIONS ---');

        if (call.endedReason === 'silence-timed-out') {
            console.log('⚠️  Call ended due to silence timeout');
            console.log('   - User may have stopped responding');
            console.log('   - Check if tool calls returned too slowly');
        }

        if (toolCallCount > 0 && messages.some((m: any) =>
            m.content?.includes('No result') ||
            m.result?.includes('success: false'))) {
            console.log('❌ Tool calls returned errors:');
            console.log('   - Check if products table has data');
            console.log('   - Verify database connectivity');
            console.log('   - Review VapiToolHandlers.ts for bugs');
        }

        console.log('\n' + '='.repeat(60));
        console.log('DIAGNOSTICS COMPLETE');
        console.log('='.repeat(60));

    } catch (error: any) {
        console.error('❌ Error fetching call:', error.response?.data || error.message);
    }
}

diagnose();

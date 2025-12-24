
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:3000/api/v1';
const TEST_HANDLE = '13038159669'; // The handle we want to test
const TEST_CONV_ID = '375681c9-17fc-4767-897b-8d7d6f555024'; // Need a valid ID, I'll have to look one up or fetch list first

async function testEndpoints() {
    try {
        console.log('--- 1. Login (Bypassed for local if no auth, but likely need valid token) ---');
        // Actually, we need a token if middleware requires it.
        // For local testing, can we generate one or mock it?
        // Alternatively, use Supabase DIRECTLY to find a user or just trust headers if disabled?
        // The middleware checks 'Authorization: Bearer ...'.
        // Let's assume we need to bypass or assuming we have a valid token from .env or just fail if auth is strict.
        // Actually, let's just make sure the SERVER is running.

        // Better strategy: Use the 'list_handles.ts' logic to find a conversation ID first.

        console.log('--- 2. Fetch Conversations to find ID ---');
        // We will assume I have a valid token or I can modify the script to login via Supabase Auth API if needed.
        // BUT, simplified: I'll use the "simulate" approach but calling the CONTROLLER functions directly?
        // No, I want to test the ROUTING/HTTP layer.

        // Let's skip auth for a moment and see if we get 401. If so, I'll need a token.
        // Or I can test the controller functions via unit test style.
    } catch (e) {
        console.error(e);
    }
}

// SIMPLIFIED APPROACH:
// I will invoke the CRMService directly to ensure the LOGIC works.
// HTTP errors are usually 404 (route missing) or 500 (logic error).
// If logic works, then it's a route issue.

import { CRMService } from '../src/services/CRMService';
import { supabase } from '../src/config/supabase';

async function testLogic() {
    const crm = CRMService.getInstance();

    console.log('--- Testing updateContactSnapshot ---');
    try {
        const res = await crm.updateContactSnapshot(TEST_HANDLE, 'WA', { name: 'Brittany Test' });
        console.log('✅ updateContactSnapshot Success:', res);
    } catch (e: any) {
        console.error('❌ updateContactSnapshot Failed:', e.message);
    }

    console.log('--- Testing updateConversationFacts ---');
    try {
        // First get a conv id
        const { data: conv } = await supabase.from('conversations').select('id').eq('contact_handle', TEST_HANDLE).limit(1).single();
        if (conv) {
            const resFacts = await crm.updateConversationFacts(conv.id, { test_update: true });
            console.log('✅ updateConversationFacts Success:', resFacts);
        } else {
            console.log('⚠️ No conversation found for handle');
        }
    } catch (e: any) {
        console.error('❌ updateConversationFacts Failed:', e.message);
    }
}

testLogic();

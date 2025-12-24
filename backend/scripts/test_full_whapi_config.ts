import * as dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

async function fullTest() {
    console.log('=== FULL WHAPI DIAGNOSTIC ===\n');

    // 1. Health check
    console.log('1. Health Check:');
    try {
        const health = await axios.get(`${WHAPI_BASE_URL}/health`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log('   Status:', health.data.status?.text || health.data);
    } catch (e: any) {
        console.log('   Error:', e.message);
    }

    // 2. Get ALL settings
    console.log('\n2. Full Settings:');
    try {
        const settings = await axios.get(`${WHAPI_BASE_URL}/settings`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log(JSON.stringify(settings.data, null, 2));
    } catch (e: any) {
        console.log('   Error:', e.message);
    }

    // 3. Try to get a single contact with full details
    console.log('\n3. Single Contact Full Details (5214941301513):');
    try {
        const contact = await axios.get(`${WHAPI_BASE_URL}/contacts/5214941301513`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log(JSON.stringify(contact.data, null, 2));
    } catch (e: any) {
        console.log('   Error:', e.response?.data || e.message);
    }

    // 4. Try to get profile specifically
    console.log('\n4. Contact Profile (5214941301513):');
    try {
        const profile = await axios.get(`${WHAPI_BASE_URL}/contacts/5214941301513/profile`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log(JSON.stringify(profile.data, null, 2));
    } catch (e: any) {
        console.log('   Error:', e.response?.data || e.message);
    }

    // 5. Check API limits
    console.log('\n5. API Limits:');
    try {
        const limits = await axios.get(`${WHAPI_BASE_URL}/limits`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log(JSON.stringify(limits.data, null, 2));
    } catch (e: any) {
        console.log('   Error:', e.response?.data || e.message);
    }

    // 6. Try getting a SINGLE chat with full details
    console.log('\n6. Single Chat Full Details:');
    try {
        const chat = await axios.get(`${WHAPI_BASE_URL}/chats/5214941301513@s.whatsapp.net`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log(JSON.stringify(chat.data, null, 2));
    } catch (e: any) {
        console.log('   Error:', e.response?.data || e.message);
    }
}

fullTest().catch(console.error);

import * as dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

// Test the contact from screenshot that SHOULD have avatar (visible in WhatsApp desktop)
const testPhone = '5214941301513';  // +52 494 130 1513 with 521 prefix

async function testMultipleEndpoints(phone: string) {
    console.log(`Testing phone: ${phone}\n`);

    // Method 1: /contacts/{phone}/profile
    console.log('=== Method 1: /contacts/{phone}/profile ===');
    try {
        const r1 = await axios.get(`${WHAPI_BASE_URL}/contacts/${phone}/profile`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log('Response:', JSON.stringify(r1.data, null, 2));
    } catch (e: any) {
        console.log('Error:', e.response?.status, e.response?.data?.error?.message);
    }

    // Method 2: /contacts/{phone} (full contact info)
    console.log('\n=== Method 2: /contacts/{phone} ===');
    try {
        const r2 = await axios.get(`${WHAPI_BASE_URL}/contacts/${phone}`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log('Response:', JSON.stringify(r2.data, null, 2));
    } catch (e: any) {
        console.log('Error:', e.response?.status, e.response?.data?.error?.message);
    }

    // Method 3: Check if number exists first
    console.log('\n=== Method 3: /contacts/check-exist ===');
    try {
        const r3 = await axios.post(`${WHAPI_BASE_URL}/contacts/check-exist`, {
            blocking: 'wait',
            contacts: [phone]
        }, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}`, 'Content-Type': 'application/json' }
        });
        console.log('Response:', JSON.stringify(r3.data, null, 2));
    } catch (e: any) {
        console.log('Error:', e.response?.status, e.response?.data?.error?.message);
    }

    // Method 4: Try getting chat info (if chat exists)
    console.log('\n=== Method 4: /chats/{chatId} ===');
    const chatId = `${phone}@s.whatsapp.net`;
    try {
        const r4 = await axios.get(`${WHAPI_BASE_URL}/chats/${chatId}`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        console.log('Response:', JSON.stringify(r4.data, null, 2));
    } catch (e: any) {
        console.log('Error:', e.response?.status, e.response?.data?.error?.message);
    }

    // Method 5: Get recent chats and check if avatar is included
    console.log('\n=== Method 5: /chats (list) - checking for avatars ===');
    try {
        const r5 = await axios.get(`${WHAPI_BASE_URL}/chats?count=5`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });
        const chats = r5.data.chats || [];
        console.log('Found', chats.length, 'chats');
        chats.forEach((chat: any) => {
            console.log(`- ${chat.id}: icon=${chat.chat_pic ? 'YES' : 'NO'} (${chat.chat_pic?.slice(0, 50) || 'null'}...)`);
        });
    } catch (e: any) {
        console.log('Error:', e.response?.status, e.response?.data?.error?.message);
    }
}

testMultipleEndpoints(testPhone).catch(console.error);

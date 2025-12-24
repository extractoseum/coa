
import dotenv from 'dotenv';
import path from 'path';

// FORCE LOAD ENV BEFORE ANY OTHER IMPORTS
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

import axios from 'axios';
import { getContactInfo } from '../src/services/whapiService';

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

if (!WHAPI_TOKEN) {
    console.error('❌ WHAPI_TOKEN is missing in .env');
    process.exit(1);
}

const api = axios.create({
    baseURL: WHAPI_BASE_URL,
    headers: { Authorization: `Bearer ${WHAPI_TOKEN}` }
});

async function run() {
    const PHONE = '4941301513';
    // ID from the debug output for the audio message
    const VOICE_ID = 'oga-ac5d2110e70bfedf8e8922284ac288fb-85803a21270080a3';

    console.log(`\n--- 1. Testing Avatar Fetch for ${PHONE} ---`);
    try {
        const result = await getContactInfo(PHONE);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error: any) {
        console.error('Avatar Error:', error.message);
    }

    console.log(`\n--- 2. Testing Media Retrieval (Voice ID: ${VOICE_ID.substring(0, 10)}...) ---`);
    // Strategy A: Try GET /messages/{id} (maybe it has the link now?)
    // Note: The ID in raw_payload.id is the EXTERNAL message ID (Whapi's ID?). 
    // Wait, raw_payload.id in debug output was "rF0hEOcL_t.OiSIoSsKI.w-hYA6IScAgKM" (External).
    // The voice object had "id": "oga-..."

    // Let's try to get the message details again to see if "link" appears in a fresh fetch
    const MSG_ID = 'rF0hEOcL_t.OiSIoSsKI.w-hYA6IScAgKM';
    // Whapi endpoint to get message: /messages/{id}
    // Docs say: GET /messages/:id

    try {
        console.log(`Fetching Message Details for ${MSG_ID}...`);
        const msgRes = await api.get(`/messages/${MSG_ID}`);
        console.log('Message Details:', JSON.stringify(msgRes.data, null, 2));

        // Strategy B: Try to fetch media directly
        console.log(`\n--- 3. Testing Media Download (Probing) ---`);

        // Variation 1: GET /messages/{id}/voice
        try {
            console.log(`Trying GET /messages/${MSG_ID}/voice ...`);
            const res1 = await api.get(`/messages/${MSG_ID}/voice`, { responseType: 'arraybuffer' });
            console.log(`SUCCESS /voice! Length: ${res1.data.length}`);
        } catch (e: any) { console.log(`Failed /voice: ${e.response?.status}`); }

        // Variation 2: GET /media/{voiceId}
        try {
            console.log(`Trying GET /media/${VOICE_ID} ...`);
            const res2 = await api.get(`/media/${VOICE_ID}`, { responseType: 'arraybuffer' });
            console.log(`SUCCESS /media/{id}! Length: ${res2.data.length}`);
        } catch (e: any) { console.log(`Failed /media/{id}: ${e.response?.status}`); }

        // Variation 3: Base64 from message? 
        // Some APIs return base64 in the message details if you pass ?include=media
        try {
            console.log(`Trying GET /messages/${MSG_ID}?include=media ...`);
            const res3 = await api.get(`/messages/${MSG_ID}?include=media`);
            console.log(`Result keys: ${Object.keys(res3.data)}`);
            if (res3.data.voice?.data) console.log('Found voice.data (base64)!');
        } catch (e: any) { console.log(`Failed ?include=media: ${e.response?.status}`); }

    } catch (error: any) {
        console.error('Message Fetch Error:', error.response?.data || error.message);
    }
}

run();

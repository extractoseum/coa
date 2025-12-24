import * as dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

async function testChats() {
    console.log('Testing /chats endpoint for avatars...\n');

    try {
        const response = await axios.get(`${WHAPI_BASE_URL}/chats?count=20`, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });

        const chats = response.data.chats || [];
        console.log(`Found ${chats.length} chats\n`);

        console.log('=== CHATS WITH AVATAR INFO ===\n');
        for (const chat of chats) {
            const hasAvatar = chat.chat_pic && chat.chat_pic.length > 10;
            const name = chat.name || chat.id;
            console.log(`${hasAvatar ? '✅' : '❌'} ${name}`);
            if (hasAvatar) {
                console.log(`   Avatar: ${chat.chat_pic.substring(0, 80)}...`);
            }
            console.log(`   ID: ${chat.id}`);
            console.log('');
        }

        // Count stats
        const withAvatar = chats.filter((c: any) => c.chat_pic && c.chat_pic.length > 10).length;
        console.log(`\n=== STATS ===`);
        console.log(`With avatar: ${withAvatar}/${chats.length}`);

    } catch (error: any) {
        console.log('Error:', error.response?.status, error.response?.data || error.message);
    }
}

testChats().catch(console.error);

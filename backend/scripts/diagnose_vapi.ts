import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;

if (!API_KEY) {
    console.error('❌ Error: VAPI_API_KEY not found in environment');
    process.exit(1);
}
const BASE_URL = 'https://api.vapi.ai';

async function main() {
    try {
        console.log('Fetching Assistants...');
        const assistants = await axios.get(`${BASE_URL}/assistant`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        console.log('Assistants:', JSON.stringify(assistants.data, null, 2));

        console.log('Fetching Phone Numbers...');
        const phones = await axios.get(`${BASE_URL}/phone-number`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        console.log('Phones:', JSON.stringify(phones.data, null, 2));

    } catch (error: any) {
        console.error('Error:', error.response?.data || error.message);
    }
}

main();

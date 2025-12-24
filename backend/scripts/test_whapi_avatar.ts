import * as dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

// Test different phone formats
const testPhones = [
    '4941301513',        // 10 digits (from your screenshot - should work)
    '5214941301513',     // 13 digits (521 + 10)
    '524941301513',      // 12 digits (52 + 10) - legacy
    '522228639522',      // Handle as-is from DB (sin avatar)
    '3327177432',        // Handle as-is from DB (con avatar - delta)
];

async function testProfile(phone: string) {
    console.log(`\n--- Testing: ${phone} ---`);
    try {
        const response = await axios.get(
            `${WHAPI_BASE_URL}/contacts/${phone}/profile`,
            {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error: any) {
        console.log('Error:', error.response?.status, error.response?.data || error.message);
        return null;
    }
}

async function main() {
    console.log('WHAPI Base URL:', WHAPI_BASE_URL);
    console.log('Token configured:', !!WHAPI_TOKEN);

    for (const phone of testPhones) {
        await testProfile(phone);
    }
}

main().catch(console.error);

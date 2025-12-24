
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

async function checkAvatar(phone: string) {
    console.log(`Checking avatar for ${phone}...`);
    try {
        const response = await axios.post(
            `${WHAPI_BASE_URL}/contacts`,
            {
                blocking: "wait",
                force_check: true,
                contacts: [phone]
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const contact = response.data.contacts?.[0];
        if (contact) {
            console.log('Contact Found:', JSON.stringify(contact, null, 2));
        } else {
            console.log('Contact not found in Whapi response.');
        }
    } catch (error: any) {
        console.error('Error fetching contact:', error.response?.data || error.message);
    }
}

// Check the number from the screenshot
checkAvatar('5212461225458'); // Trying 2461225458 (Chimal) from screenshot as well if needed, 
// but let's check the open chat: 3327177432
checkAvatar('5213327177432');

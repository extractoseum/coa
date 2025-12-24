import * as dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';

async function checkSettings() {
    console.log('Checking current Whapi settings...\n');

    try {
        const response = await axios.get(
            `${WHAPI_BASE_URL}/settings`,
            {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Current Settings:');
        console.log(JSON.stringify(response.data, null, 2));

        // Check specifically for media settings
        const media = response.data?.media;
        console.log('\n=== MEDIA SETTINGS ===');
        console.log('init_avatars:', media?.init_avatars ?? 'NOT SET');
        console.log('auto_download:', media?.auto_download ?? 'NOT SET');

    } catch (error: any) {
        console.log('Error getting settings:', error.response?.status, error.response?.data || error.message);
    }
}

async function enableAvatars() {
    console.log('\n\nEnabling init_avatars...');

    try {
        const response = await axios.patch(
            `${WHAPI_BASE_URL}/settings`,
            {
                media: {
                    init_avatars: true
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Response:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error: any) {
        console.log('Error enabling avatars:', error.response?.status, error.response?.data || error.message);
        return false;
    }
}

async function main() {
    await checkSettings();

    // Ask to enable
    console.log('\n--- Attempting to enable init_avatars ---');
    const success = await enableAvatars();

    if (success) {
        console.log('\n✅ init_avatars enabled! You need to re-authorize WhatsApp in Whapi dashboard.');
    }

    // Check again
    console.log('\n--- Checking settings after update ---');
    await checkSettings();
}

main().catch(console.error);

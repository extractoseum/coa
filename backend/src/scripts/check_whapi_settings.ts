
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const API_URL = 'https://gate.whapi.cloud/settings'; // Standard endpoint for settings

async function checkSettings() {
    console.log(`--- CHECKING WHAPI SETTINGS ---`);
    console.log(`Loading .env from: ${path.resolve(process.cwd(), '.env')}`);

    if (!WHAPI_TOKEN) {
        console.error('Missing WHAPI_TOKEN (Loaded: ' + (process.env.WHAPI_TOKEN ? 'YES' : 'NO') + ')');
        return;
    }
    console.log('Token loaded: ' + WHAPI_TOKEN.substring(0, 5) + '...');

    try {
        const response = await axios.get(API_URL, {
            headers: {
                'Authorization': `Bearer ${WHAPI_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        console.log('Whapi Settings:', JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error('Error fetching settings:', error.response ? error.response.data : error.message);
    }
}

checkSettings();

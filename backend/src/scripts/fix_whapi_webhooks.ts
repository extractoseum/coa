
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const API_URL = 'https://gate.whapi.cloud/settings';

const PROD_URL = 'https://coa.extractoseum.com/api/v1/crm/inbound';

const EVENTS = [
    { type: "messages", method: "post" },
    { type: "statuses", method: "post" },
    { type: "chats", method: "post" },
    // { type: "contacts", method: "post" }, // Optional
    // { type: "groups", method: "post" },
    // { type: "presences", method: "post" },
];

async function fixWebhooks() {
    console.log('--- FIXING WHAPI WEBHOOKS ---');
    if (!WHAPI_TOKEN) {
        console.error('Missing WHAPI_TOKEN');
        return;
    }

    try {
        // 1. Get current
        const getRes = await axios.get(API_URL, {
            headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
        });

        const currentHook = getRes.data.webhooks.find((w: any) => w.url === PROD_URL);

        // 2. Define payload with ONLY One Hook
        const payload = {
            webhooks: [
                {
                    url: PROD_URL,
                    events: EVENTS,
                    mode: "method"
                }
            ]
        };

        console.log('Setting new configuration:', JSON.stringify(payload, null, 2));

        const patchRes = await axios.patch(API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Update Success:', JSON.stringify(patchRes.data, null, 2));

    } catch (error: any) {
        console.error('Error updating settings:', error.response ? error.response.data : error.message);
    }
}

fixWebhooks();


import { CRMService } from '../services/CRMService';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const crmService = CRMService.getInstance();

async function test() {
    console.log('--- TESTING processInbound ---');
    // Using the handle that exists in DB: 3327177432
    // But passing it as it comes from WhatsApp: 5213327177432
    const handle = '5213327177432';
    const content = 'TEST_MESSAGE_INGESTION_12345';

    try {
        await crmService.processInbound('WA', handle, content, {
            id: 'FAKE_WHAPI_ID_' + Date.now(),
            from: handle,
            type: 'text',
            text: { body: content },
            from_me: false,
            direction: 'inbound',
            role: 'user'
        });
        console.log('SUCCESS: processInbound finished without error.');
    } catch (err) {
        console.error('FAILURE: processInbound threw error:', err);
    }
}

test();


import dotenv from 'dotenv';
import path from 'path';

// Load env specific to backend
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

import { getContactInfo } from '../src/services/whapiService';
import { cleanupPhone } from '../src/utils/phoneUtils';

const TARGET_PHONE = '7721503270';

async function run() {
    console.log(`[Debug] Testing Avatar Fetch for: ${TARGET_PHONE}`);

    // 1. Test Normalization
    const clean = cleanupPhone(TARGET_PHONE);
    console.log(`[Debug] Normalized (10-digit): ${clean}`);

    // 2. Fetch from Whapi
    // Note: getContactInfo calls normalizePhone(..., 'whapi') internally, which expands to 521...
    console.log('[Debug] Calling getContactInfo...');
    const info = await getContactInfo(clean);

    console.log('[Debug] Result:', JSON.stringify(info, null, 2));

    if (info.exists && !info.profilePic) {
        console.warn('[WARN] Whapi found the contact but returned NO profile pic. (Maybe privacy settings or no photo?)');
    } else if (info.profilePic) {
        console.log('[SUCCESS] Profile pic URL found!');
    } else {
        console.error('[ERROR] Contact not found or error occurred.');
    }
}

run().catch(console.error);


/**
 * Script to enable 'init_avatars' in Whapi Settings.
 * Run with: npx ts-node scripts/enable_whapi_avatars.ts
 */

import { enableAvatarFetching, checkWhapiStatus } from '../src/services/whapiService';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
    console.log('--- Whapi Avatar Configuration ---');

    // 1. Check Status
    const status = await checkWhapiStatus();
    console.log('Connection Status:', status);

    if (!status.connected) {
        console.error('CRITICAL: Whapi not connected. Please re-scan QR code.');
        process.exit(1);
    }

    // 2. Enable Avatars
    console.log('\nEnabling init_avatars...');
    const success = await enableAvatarFetching();

    if (success) {
        console.log('\n✅ SUCCESS: Whapi is now configured to fetch avatars on init/message.');
        console.log('NOTE: You may need to Re-Scan QR code or Re-Authorize for changes to take full effect on existing contacts.');
    } else {
        console.error('\n❌ FAILED: Could not update Whapi settings.');
        process.exit(1);
    }
};

run();

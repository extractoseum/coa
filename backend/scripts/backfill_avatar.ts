
import { supabase } from '../src/config/supabase';
import { cleanupPhone } from '../src/utils/phoneUtils';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
    const handle = process.argv[2];
    const url = process.argv[3];

    if (!handle || !url) {
        console.error('Usage: backfill_avatar.ts <phone> <url>');
        process.exit(1);
    }

    const cleanHandle = cleanupPhone(handle);
    console.log(`Backfilling avatar for ${cleanHandle}...`);

    const { data, error } = await supabase
        .from('crm_contact_snapshots')
        .update({ avatar_url: url })
        .eq('handle', cleanHandle)
        .select();

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Success! Updated:', data);
    }
};

run();


import { supabase } from '../src/config/supabase';
import { getContactInfo } from '../src/services/whapiService';
import { cleanupPhone } from '../src/utils/phoneUtils';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const DELAY_MS = 1000;
const LIMIT = 50;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const run = async () => {
    console.log(`--- Starting Mass Avatar Backfill (Limit: ${LIMIT}) ---`);

    // 1. Fetch recent contacts with missing avatars
    const { data: contacts, error } = await supabase
        .from('crm_contact_snapshots')
        .select('handle, name')
        .is('avatar_url', null)
        .order('last_updated_at', { ascending: false })
        .limit(LIMIT);

    if (error) {
        console.error('Failed to fetch contacts:', error.message);
        process.exit(1);
    }

    if (!contacts || contacts.length === 0) {
        console.log('No recent contacts found with missing avatars.');
        process.exit(0);
    }

    console.log(`Found ${contacts.length} contacts to check.`);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    // 2. Iterate and update
    for (const contact of contacts) {
        const cleanHandle = cleanupPhone(contact.handle);

        try {
            process.stdout.write(`Processing ${contact.name || cleanHandle} (${cleanHandle})... `);

            const info = await getContactInfo(cleanHandle);

            if (info.exists && info.profilePic) {
                // Update DB
                const { error: updateError } = await supabase
                    .from('crm_contact_snapshots')
                    .update({ avatar_url: info.profilePic })
                    .eq('handle', contact.handle); // Use original handle for matching just in case, or clean? 
                // The snapshot table handles are usually clean, but let's stick to the row's handle.

                if (updateError) {
                    console.log(`❌ DB Error: ${updateError.message}`);
                    failed++;
                } else {
                    console.log(`✅ Updated!`);
                    updated++;
                }
            } else {
                console.log(`⚠️ No avatar found.`);
                skipped++;
            }

        } catch (err: any) {
            console.log(`❌ Error: ${err.message}`);
            failed++;
        }

        // Rate limit
        await delay(DELAY_MS);
    }

    console.log('\n--- Backfill Complete ---');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (No avatar): ${skipped}`);
    console.log(`Failed: ${failed}`);
};

run();

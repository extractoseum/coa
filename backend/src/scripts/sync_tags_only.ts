
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';

async function syncTagsOnly() {
    const email = 'bdelatorre8@gmail.com';
    const tags = [
        'Club_partner',
        'Club_user',
        'Gold_member',
        'Login with Shop',
        'Shop'
    ]; // Hardcoded from previous fetch outcome for speed

    console.log(`[Sync] Updating tags for ${email}...`);

    // 1. Get Client
    const { data: dbClient } = await supabase.from('clients').select('id').eq('email', email).single();
    if (!dbClient) {
        console.error('Client not found');
        return;
    }

    // 2. Update Tags ONLY
    const { error } = await supabase.from('clients').update({ tags }).eq('id', dbClient.id);

    if (error) console.error('Error updating tags:', error.message);
    else console.log('Tags updated successfully.');
}

syncTagsOnly();

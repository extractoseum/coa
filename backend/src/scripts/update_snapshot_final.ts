
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';

async function updateSnapshot() {
    console.log('[Snapshot] Manually updating bdelatorre8@gmail.com...');

    const handle = 'bdelatorre8@gmail.com';
    const ltv = 2590.00;
    const orders_count = 6;
    const tags = [
        'Club_partner',
        'Club_user',
        'Gold_member',
        'Login with Shop',
        'Shop'
    ];

    const { error } = await supabase
        .from('crm_contact_snapshots')
        .update({
            ltv,
            orders_count,
            tags,
            risk_level: 'vip', // Based on $2000+ spend
            last_updated_at: new Date().toISOString()
        })
        .eq('handle', handle);

    if (error) console.error('Error updating snapshot:', error.message);
    else console.log('Snapshot updated successfully.');
}

updateSnapshot();

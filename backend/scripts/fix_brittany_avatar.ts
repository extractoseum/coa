
import { supabase } from '../src/config/supabase';
import { CRMService } from '../src/services/CRMService';

async function fixBrittany() {
    console.log('--- FIXING AVATAR FOR 13038159669 (Brittany) ---');

    // 1. Check current state
    const { data: snapshot } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .eq('handle', '13038159669')
        .single();

    console.log('Current Avatar URL:', snapshot?.avatar_url);

    // 2. Force Sync via CRMService (which calls Whapi)
    const crm = CRMService.getInstance();
    console.log('Requesting fresh data from Whapi...');

    try {
        const updated = await crm.syncContactSnapshot('13038159669', 'WA');
        console.log('Sync Complete.');
        console.log('New Avatar URL:', updated?.avatar_url);

        if (!updated?.avatar_url) {
            console.log('WARNING: Whapi did not return an avatar. It might be privacy restricted or missing.');
        } else {
            console.log('SUCCESS: Avatar retrieved.');
        }
    } catch (e: any) {
        console.error('Sync Failed:', e.message);
    }
}

fixBrittany();


import { supabase } from '../config/supabase';
import { CRMService } from '../services/CRMService';

async function mergeIdentity() {
    const email = 'bdelatorre8@gmail.com';
    const newPhone = '3327177432';

    console.log(`[Identity] Updating ${email} to have phone ${newPhone}...`);

    // 1. Update Client
    const { error } = await supabase
        .from('clients')
        .update({ phone: newPhone })
        .eq('email', email);

    if (error) {
        console.error('Failed to update client:', error);
        return;
    }

    console.log('[Identity] Client updated. Triggering CRM Sync...');

    // 2. Trigger Sync
    const crm = CRMService.getInstance();
    try {
        const snapshot = await crm.syncContactSnapshot(newPhone, 'WA');
        console.log('[Identity] Sync complete!');
        console.log('Snapshot Tags:', snapshot.tags);
        console.log('Snapshot LTV:', snapshot.ltv);
    } catch (e) {
        console.error('Sync failed:', e);
    }
}

mergeIdentity();

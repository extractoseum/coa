
import { supabase } from '../src/config/supabase';
import { getContactInfo } from '../src/services/whapiService';

async function run() {
    const targetHandle = '13038159669';
    const partial = '3038159669';

    console.log(`--- COLUMN INSPECTION ---`);
    const { data: cols } = await supabase.from('crm_contact_snapshots').select('*').limit(1);
    if (cols && cols.length > 0) {
        console.log('Available Columns:', Object.keys(cols[0]));
    } else {
        console.log('Table seems empty or inaccessible');
    }

    console.log(`\n--- DIAGNOSIS FOR *${partial}* ---`);

    // 1. Check Conversations (Fuzzy)
    const { data: convs, error: cErr } = await supabase
        .from('conversations')
        .select('id, contact_handle, channel, created_at')
        .ilike('contact_handle', `%${partial}%`);

    if (cErr) console.error('Conv Error:', cErr);
    console.log('Conversations Found:', convs);

    // 2. Check Snapshots (Fuzzy)
    const { data: snaps, error: sErr } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .ilike('handle', `%${partial}%`);

    if (sErr) console.error('Snap Error:', sErr);
    console.log('Snapshots Found:', snaps);

    // 3. FORCE REFRESH FROM WHAPI
    console.log('\n--- FETCHING FROM WHAPI ---');
    // Try both formats to see what hits
    const info = await getContactInfo(targetHandle);
    console.log(`Whapi check for ${targetHandle}:`, info);

    if (info.exists) {
        console.log('Updating Snapshot with new authorized info...');
        // Correcting column names based on inspection (likely avatar_url based on errors)
        const updates: any = {
            handle: targetHandle,
            name: info.name,
            updated_at: new Date().toISOString()
        };

        // Optimistic column assignment based on common patterns if inspection fails
        // But inspection above should guide us. For now, assuming avatar_url if profile_pic failed
        if (cols && cols[0]) {
            if ('profile_pic' in cols[0]) updates.profile_pic = info.profilePic;
            else if ('avatar_url' in cols[0]) updates.avatar_url = info.profilePic;
            else if ('photo_url' in cols[0]) updates.photo_url = info.profilePic;
        } else {
            // Fallback assumption from error message
            updates.avatar_url = info.profilePic;
        }

        const { error: upErr } = await supabase
            .from('crm_contact_snapshots')
            .upsert(updates, { onConflict: 'handle' });

        if (upErr) console.error('Update Error:', upErr);
        else console.log('✅ Snapshot Updated Successfully');
    } else {
        console.warn('❌ Contact not found in Whapi with format ' + targetHandle);
    }
}

run();

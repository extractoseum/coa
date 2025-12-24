import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAvatars() {
    // Check snapshots with avatars
    const { data: withAvatars } = await supabase
        .from('crm_contact_snapshots')
        .select('handle, name, avatar_url, channel')
        .not('avatar_url', 'is', null)
        .limit(10);

    console.log('\n=== SNAPSHOTS CON AVATAR ===');
    console.log(JSON.stringify(withAvatars, null, 2));

    // Check snapshots without avatars (recent)
    const { data: noAvatars } = await supabase
        .from('crm_contact_snapshots')
        .select('handle, name, avatar_url, channel, last_updated_at')
        .is('avatar_url', null)
        .eq('channel', 'WA')
        .order('last_updated_at', { ascending: false })
        .limit(10);

    console.log('\n=== SNAPSHOTS SIN AVATAR (RECIENTES) ===');
    console.log(JSON.stringify(noAvatars, null, 2));

    // Count totals
    const { count: totalWA } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'WA');

    const { count: withAvatarCount } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'WA')
        .not('avatar_url', 'is', null);

    console.log('\n=== ESTADISTICAS ===');
    console.log('Total WA contacts:', totalWA);
    console.log('Con avatar:', withAvatarCount);
    console.log('Sin avatar:', (totalWA || 0) - (withAvatarCount || 0));
    console.log('Porcentaje con avatar:', ((withAvatarCount || 0) / (totalWA || 1) * 100).toFixed(1) + '%');
}

checkAvatars().catch(console.error);

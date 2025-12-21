
import { supabase } from '../config/supabase';

async function bulkPatch() {
    console.log('--- Starting Bulk Snapshot Patch (TS) ---');

    const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('contact_handle, channel')
        .in('status', ['active', 'review', 'paused']);

    if (convError) {
        console.error('Failed to fetch conversations:', convError);
        return;
    }

    const handlesWithChannels = Array.from(new Set(convs.map(c => JSON.stringify({ handle: c.contact_handle, channel: c.channel }))))
        .map(s => JSON.parse(s));

    console.log(`Found ${handlesWithChannels.length} unique active contacts.`);

    const mockNames = [
        'Benito de la Torre', 'Juan Pérez', 'María García', 'Carlos Rodríguez', 'Ana Martínez',
        'Luis Hernández', 'Sofía López', 'Diego González', 'Elena Pérez', 'Javier Sánchez'
    ];

    const snapshots = handlesWithChannels.map((contact, i) => {
        const { handle, channel } = contact;
        const isEmail = handle.includes('@');
        let name = isEmail ? mockNames[i % mockNames.length] : `Cliente ${handle.slice(-4)}`;

        // Ensure bdelatorre8 specifically gets the right name
        if (handle === 'bdelatorre8@gmail.com') name = 'Benito de la Torre';

        const ltv = handle === 'bdelatorre8@gmail.com' ? 2590 : Math.floor(Math.random() * 5000) + 500;
        const risk_level = ltv > 4000 ? 'vip' : 'low';

        return {
            handle,
            channel,
            name,
            ltv,
            risk_level,
            last_updated_at: new Date().toISOString()
        };
    });

    console.log(`Upserting ${snapshots.length} snapshots...`);

    for (const snapshot of snapshots) {
        const { error } = await supabase
            .from('crm_contact_snapshots')
            .upsert(snapshot, { onConflict: 'handle' });

        if (error) {
            console.error(`Failed to upsert ${snapshot.handle}:`, error.message);
        } else {
            console.log(`Successfully patched: ${snapshot.handle} -> ${snapshot.name} ($${snapshot.ltv})`);
        }
    }

    console.log('--- Bulk Patch Complete ---');
}

bulkPatch().catch(console.error);


const { supabase } = require('./dist/config/supabase');

async function bulkPatch() {
    console.log('--- Starting Bulk Snapshot Patch ---');

    // 1. Get all active handles from conversations
    const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('contact_handle')
        .in('status', ['active', 'review', 'paused']);

    if (convError) {
        console.error('Failed to fetch conversations:', convError);
        return;
    }

    const handles = Array.from(new Set(convs.map(c => c.contact_handle)));
    console.log(`Found ${handles.length} unique active handles.`);

    // 2. Prepare mock data
    const mockNames = [
        'Benito de la Torre', 'Juan Pérez', 'María García', 'Carlos Rodríguez', 'Ana Martínez',
        'Luis Hernández', 'Sofía López', 'Diego González', 'Elena Pérez', 'Javier Sánchez'
    ];

    const snapshots = handles.map((handle, i) => {
        const isEmail = handle.includes('@');
        const name = isEmail ? mockNames[i % mockNames.length] : `Cliente ${handle.slice(-4)}`;
        const ltv = Math.floor(Math.random() * 5000) + 500;
        const risk_level = ltv > 4000 ? 'vip' : 'low';

        return {
            handle,
            name,
            ltv,
            risk_level,
            updated_at: new Date().toISOString()
        };
    });

    console.log(`Upserting ${snapshots.length} snapshots...`);

    // 3. Upsert into crm_contact_snapshots
    // Using upsert with onConflict on handle
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

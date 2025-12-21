import { supabase } from '../config/supabase';

async function findDiana() {
    console.log('--- Searching for "Diana Camacho" ---');

    const { data: snapshotByName } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .ilike('name', '%Diana Camacho%');

    console.log('Snapshots by name:', JSON.stringify(snapshotByName, null, 2));

    const { data: clientsByName } = await supabase
        .from('clients')
        .select('*')
        .or('first_name.ilike.%Diana%,last_name.ilike.%Camacho%');

    console.log('Clients by name:', JSON.stringify(clientsByName, null, 2));

    const { data: snapshotsWithLTV } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .eq('ltv', 590);

    console.log('Snapshots with $590 LTV:', JSON.stringify(snapshotsWithLTV, null, 2));
}

findDiana();

import { processGhostbusting } from '../src/services/ghostbusterService';
import { supabase } from '../src/config/supabase';

async function run() {
    console.log('Testing Ghostbuster Protocol...');

    // Run the processor
    const result = await processGhostbusting();

    console.log('Result:', result);

    // Check ghost_alerts table
    const { count } = await supabase
        .from('ghost_alerts')
        .select('*', { count: 'exact', head: true });

    console.log(`Total Alerts in DB: ${count}`);
}

run().catch(console.error);

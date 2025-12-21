import { supabase } from './config/supabase';

async function reloadSchema() {
    console.log('Reloading PostgREST schema cache...');
    const { error } = await supabase.rpc('reload_schema');

    if (error) {
        // If RPC doesn't exist, try a DDL change or just notify
        console.warn('RPC reload_schema failed:', error.message);
        console.log('Attempting NOTIFY pgrst, reload schema...');
        const { error: notifyError } = await supabase.from('shopify_sync_metadata').upsert({
            sync_type: 'schema_reload_pulse',
            last_sync_at: new Date().toISOString()
        });
        if (notifyError) console.error('Notify error:', notifyError);
    } else {
        console.log('Schema reloaded successfully via RPC.');
    }
}

reloadSchema();

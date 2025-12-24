import { supabase } from '../src/config/supabase';

async function inspectChips() {
    console.log('--- DATA START ---');
    const { data: chips, error } = await supabase
        .from('channel_chips')
        .select('id, platform, account_reference, default_entry_column_id, default_agent_id, is_active');

    if (error) {
        console.error('Error fetching chips:', error);
    } else {
        console.log('CHIPS:', JSON.stringify(chips, null, 2));
    }

    const { data: columns, error: colError } = await supabase
        .from('crm_columns')
        .select('id, name, position');

    if (colError) {
        console.error('Error fetching columns:', colError);
    } else {
        console.log('COLUMNS:', JSON.stringify(columns, null, 2));
    }
    console.log('--- DATA END ---');
}

inspectChips();

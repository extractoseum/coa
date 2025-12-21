
const { supabase } = require('./dist/config/supabase');

async function checkInvisibleConvs() {
    console.log('--- Checking for Invisible Conversations (NULL column_id) ---');
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, contact_handle, column_id, status')
        .is('column_id', null)
        .in('status', ['active', 'review', 'paused']);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!convs || convs.length === 0) {
        console.log('No conversations found with NULL column_id.');
    } else {
        console.log(`Found ${convs.length} invisible conversations:`);
        console.table(convs);
    }
}

checkInvisibleConvs().catch(console.error);

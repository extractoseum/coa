// Cleanup script - Remove orphaned COAs from client folders
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupFolders() {
    // Bernardo Adlt's client ID
    const bernardoClientId = 'ce83d522-1126-4244-9f5e-49bbf9702b24';

    console.log('Cleaning up folder associations for Bernardo Adlt...');

    // 1. Get all folders belonging to Bernardo
    const { data: folders, error: folderError } = await supabase
        .from('folders')
        .select('id, name')
        .eq('client_id', bernardoClientId);

    if (folderError) {
        console.error('Error fetching folders:', folderError);
        return;
    }

    console.log(`Found ${folders?.length || 0} folders for Bernardo`);

    if (!folders || folders.length === 0) {
        console.log('No folders found, nothing to clean');
        return;
    }

    const folderIds = folders.map(f => f.id);
    console.log('Folder IDs:', folderIds);

    // 2. Get all COAs currently assigned to Bernardo
    const { data: bernardoCoas, error: coaError } = await supabase
        .from('coas')
        .select('id')
        .eq('client_id', bernardoClientId);

    const bernardoCoaIds = (bernardoCoas || []).map(c => c.id);
    console.log(`Bernardo currently has ${bernardoCoaIds.length} COAs assigned`);

    // 3. Find folder_coas entries in Bernardo's folders that point to COAs he doesn't own
    const { data: folderCoas, error: fcError } = await supabase
        .from('folder_coas')
        .select('id, folder_id, coa_id')
        .in('folder_id', folderIds);

    if (fcError) {
        console.error('Error fetching folder_coas:', fcError);
        return;
    }

    console.log(`Found ${folderCoas?.length || 0} total folder-COA associations`);

    // Find orphaned entries (COAs in folders that Bernardo no longer owns)
    const orphanedEntries = (folderCoas || []).filter(fc => !bernardoCoaIds.includes(fc.coa_id));
    console.log(`Found ${orphanedEntries.length} orphaned entries to remove`);

    if (orphanedEntries.length === 0) {
        console.log('No orphaned entries found');
        return;
    }

    // 4. Delete orphaned entries
    const orphanedIds = orphanedEntries.map(e => e.id);
    const { data: deleted, error: deleteError } = await supabase
        .from('folder_coas')
        .delete()
        .in('id', orphanedIds)
        .select();

    if (deleteError) {
        console.error('Error deleting orphaned entries:', deleteError);
        return;
    }

    console.log(`Successfully removed ${deleted?.length || 0} orphaned folder-COA associations`);
    console.log('Cleanup complete!');
}

cleanupFolders().catch(console.error);

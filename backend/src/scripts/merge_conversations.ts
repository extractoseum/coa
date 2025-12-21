
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeConversations() {
    const targetId = '32fa3a3c-1370-4bd3-9bf2-fae593f64842'; // 3327177432
    const sourceIds = [
        '691532d0-b04c-4888-a51b-8ca363654054', // 523327177432
        '4ed4b08f-4b9d-445d-9e35-a6a790841530'  // +5213327177432
    ];

    console.log(`--- MERGING CONVERSATIONS INTO ${targetId} ---`);

    for (const sourceId of sourceIds) {
        console.log(`Moving messages from ${sourceId}...`);
        const { error: moveError } = await supabase
            .from('crm_messages')
            .update({ conversation_id: targetId })
            .eq('conversation_id', sourceId);

        if (moveError) {
            console.error(`Error moving messages from ${sourceId}:`, moveError);
            continue;
        }

        console.log(`Deleted source conversation ${sourceId}...`);
        const { error: delError } = await supabase
            .from('conversations')
            .delete()
            .eq('id', sourceId);

        if (delError) {
            console.error(`Error deleting ${sourceId}:`, delError);
        }
    }

    console.log('--- MERGE COMPLETE ---');
}

mergeConversations();

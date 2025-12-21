
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Map of BAD (Duplicate) -> GOOD (Original with Config)
const MERGE_MAP: Record<string, string> = {
    // Nuevos
    '5ba0a76d-1087-41bc-a834-cba38d479524': '8aeeb864-1a0e-4cec-8c3c-ad858d307d03',
    // Ventas / Ara
    'a80e1003-19b5-4a0a-9675-4f78000092f0': 'da57192a-7a32-4e8d-a8ff-6cce77e8300c',
    // Seguimiento
    'cba15a68-d306-4d83-b006-e3b8890f8f7d': 'cf8e58bf-3aea-448c-9e43-0e3f2280e720',
    // Soporte Humano
    '14d9d3b4-c8a1-41ae-a4eb-56335ef16dda': '8f16a07c-f6a8-4df4-8b87-07f5c32579de',
    // Finalizados
    '2215a9bf-ba48-4c46-bcf3-7ccf2badbfdb': '0a2a0f73-918a-4055-b8f1-4ffb7ad9e064'
};

async function mergeColumns() {
    console.log('--- MERGING DUPLICATE COLUMNS ---');

    for (const [badId, goodId] of Object.entries(MERGE_MAP)) {
        console.log(`Merging ${badId} -> ${goodId}...`);

        // 1. Move conversations
        const { error: moveError } = await supabase
            .from('conversations')
            .update({ column_id: goodId })
            .eq('column_id', badId);

        if (moveError) {
            console.error(`Failed to move conversations from ${badId}:`, moveError);
            continue;
        }

        // 2. Delete bad column
        const { error: deleteError } = await supabase
            .from('crm_columns')
            .delete()
            .eq('id', badId);

        if (deleteError) {
            console.error(`Failed to delete bad column ${badId}:`, deleteError);
        } else {
            console.log(`Successfully merged and deleted ${badId}`);
        }
    }
}

mergeColumns();

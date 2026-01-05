
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAraKnowledge() {
    console.log('🔍 Checking Ara knowledge indexing status...\n');

    const { count, error } = await supabase
        .from('knowledge_base')
        .select('*', { count: 'exact', head: true })
        .eq('metadata->>agent', 'ara');

    if (error) {
        console.error('❌ Error checking database:', error.message);
        process.exit(1);
    }

    console.log(`📊 Current Ara Knowledge Count: ${count} embeddings`);

    if (count && count >= 89) {
        console.log('✅ Indexing appears COMPLETE (Found >= 89 chunks).');
    } else if (count && count > 0) {
        console.log(`⚠️ Indexing is INCOMPLETE (Found ${count} chunks, expected ~89+).`);
    } else {
        console.log('❌ NO knowledge found for agent: ara.');
    }

    process.exit(0);
}

verifyAraKnowledge().catch(err => {
    console.error(err);
    process.exit(1);
});

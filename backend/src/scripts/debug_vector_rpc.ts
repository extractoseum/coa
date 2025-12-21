
import { createClient } from '@supabase/supabase-js';
import { AIService } from '../services/aiService';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const aiService = AIService.getInstance();

async function debugSearch() {
    console.log('🧪 Debugging Vector Search RPC...');
    const query = "gummies for sleep";

    console.log(`Generating embedding for: "${query}"`);
    const embedding = await aiService.generateEmbedding(query);

    console.log('Calling match_knowledge with threshold 0.01...');
    const { data, error } = await supabase.rpc('match_knowledge', {
        query_embedding: embedding,
        match_threshold: 0.01,
        match_count: 5
    });

    if (error) {
        console.error('❌ RPC Error:', error);
    } else {
        console.log(`✅ Found ${data.length} results.`);
        data.forEach((r: any) => {
            console.log(`- [${r.similarity.toFixed(4)}] ${r.content.substring(0, 50)}...`);
        });
    }
}

debugSearch();

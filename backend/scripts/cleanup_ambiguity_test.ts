
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_CONV_ID = 'adfd127a-6285-45a0-a69e-7d7dfc6461fa'; // Confirmed from previous steps

async function cleanup() {
    console.log(`🧹 Cleaning up ambiguity test data for conversation ${TARGET_CONV_ID}...`);

    const { data: conv, error: fetchError } = await supabase
        .from('conversations')
        .select('facts')
        .eq('id', TARGET_CONV_ID)
        .single();

    if (fetchError) {
        console.error('❌ Failed to fetch conversation:', fetchError.message);
        return;
    }

    if (!conv || !conv.facts) {
        console.log('⚠️ No facts found to clean.');
        return;
    }

    const newFacts = {
        ...conv.facts,
        identity_ambiguity: false,
        ambiguity_candidates: [] // Clear candidates
    };

    const { error: updateError } = await supabase
        .from('conversations')
        .update({ facts: newFacts })
        .eq('id', TARGET_CONV_ID);

    if (updateError) {
        console.error('❌ Failed to update rules:', updateError.message);
    } else {
        console.log('✅ Cleanup successful! Ambiguity flag removed.');
    }
}

cleanup();


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_HANDLE = '13038159669'; // 10-digit normalized or original? Logic normalizes it. 
// Original input in simulate was 13038159669. Normalization cleanPhone('13038159669') -> '13038159669' (US 11 digits) or '3038159669' (MX)?
// cleanPhone handles US 1 starts with 1 and length 11.
// '13038159669' is length 11, starts with 1. So it stays '13038159669'. 

const TARGET_CONV_ID = 'adfd127a-6285-45a0-a69e-7d7dfc6461fa';

async function verify() {
    console.log('🔍 Verifying Resolution State...');

    // 1. Check Contact Snapshot
    // We need to check both original and normalized just in case
    const { data: snapshot } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .eq('handle', '13038159669')
        .maybeSingle();

    console.log('\n👤 Contact Snapshot:');
    if (snapshot) {
        console.log(`   Name: ${snapshot.name}`);
        console.log(`   Handle: ${snapshot.handle}`);
        console.log(`   Updated: ${snapshot.last_updated_at}`);
    } else {
        console.log('   ❌ Contact not found (checked 13038159669)');
    }

    // 2. Check Conversation Facts
    const { data: conv } = await supabase
        .from('conversations')
        .select('facts')
        .eq('id', TARGET_CONV_ID)
        .single();

    console.log('\n📝 Conversation Facts:');
    if (conv && conv.facts) {
        console.log(`   Identity Ambiguity: ${conv.facts.identity_ambiguity}`);
        console.log(`   Candidates: ${JSON.stringify(conv.facts.ambiguity_candidates)}`);
    } else {
        console.log('   ❌ Conversation/Facts not found');
    }
}

verify();

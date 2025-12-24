
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_CONV_ID = 'adfd127a-6285-45a0-a69e-7d7dfc6461fa';

async function check() {
    console.log(`🔍 Checking facts for conversation ${TARGET_CONV_ID}...`);

    const { data: conv, error } = await supabase
        .from('conversations')
        .select('facts')
        .eq('id', TARGET_CONV_ID)
        .single();

    if (error) {
        console.error('❌ Error fetching conversation:', error.message);
        return;
    }

    const facts = conv.facts || {};
    console.log('Facts:', JSON.stringify(facts, null, 2));

    if (!facts.system_inquiry) {
        console.log('✅ PASS: system_inquiry is GONE. Resolution successful.');
    } else {
        console.error('❌ FAIL: system_inquiry is STILL PRESENT.');
    }
}

check();

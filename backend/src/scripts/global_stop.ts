
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function globalStop() {
    console.log('🚨 INITIATING GLOBAL AI EMERGENCY SHUTDOWN 🚨');

    const { data, error } = await supabase
        .from('crm_columns')
        .update({ mode: 'HUMAN_MODE' })
        .neq('mode', 'HUMAN_MODE'); // Update all that are not human

    if (error) {
        console.error('❌ Global shutdown failed:', error);
    } else {
        console.log('✅ GLOBAL SHUTDOWN SUCCESSFUL. All columns set to HUMAN_MODE.');
    }
}

globalStop();

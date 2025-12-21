
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function emergencyStart() {
    console.log('💚 INITIATING AI STARTUP FOR COLUMN: Nuevos 💚');

    // 1. Find the Column
    const { data: cols, error: findError } = await supabase
        .from('crm_columns')
        .select('*')
        .ilike('name', 'Nuevos');

    if (findError || !cols || cols.length === 0) {
        console.error('❌ Could not find column "Nuevos"', findError);
        return;
    }

    const col = cols[0];
    console.log(`Found Column: ${col.name} (${col.id}). Current Mode: ${col.mode}`);

    // 2. Force Update
    const { error: updateError } = await supabase
        .from('crm_columns')
        .update({ mode: 'AI_MODE' })
        .eq('id', col.id);

    if (updateError) {
        console.error('❌ Update failed:', updateError);
    } else {
        console.log('✅ AI STARTED SUCCESSFULLY. Column is now in AI_MODE.');
    }
}

emergencyStart();


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDB() {
    const token = 'aaeaca91';
    console.log(`🔍 Inspecting DATABASE state for token: ${token}`);

    const { data: coa, error } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', token)
        .single();

    if (error || !coa) {
        console.error('Error fetching COA:', error);
        return;
    }

    console.log('--- DB RESULTS ---');
    console.log(`ID: ${coa.id}`);
    console.log(`Cannabinoids Count: ${coa.cannabinoids?.length || 0}`);
    console.log(`Has Peaks in Metadata: ${!!coa.metadata?.peaks}`);
    if (coa.metadata?.peaks) {
        console.log(`Peaks Count: ${coa.metadata.peaks.length}`);
    }
    console.log(`Re-extracted at: ${coa.metadata?.re_extracted_at}`);

    if (coa.cannabinoids && coa.cannabinoids.length > 0) {
        console.log('Sample Cannabinoid Analyte:', coa.cannabinoids[0].analyte);
    } else {
        console.log('CANNABINOIDS ARRAY IS EMPTY IN DB');
    }
}

inspectDB().catch(console.error);

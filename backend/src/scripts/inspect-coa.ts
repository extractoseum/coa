
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectCOA() {
    const token = 'b304cd64';
    console.log(`🔍 Inspecting COA with token: ${token}`);

    const { data: coa, error } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', token)
        .single();

    if (error) {
        console.error('Error fetching COA:', error);
        return;
    }

    if (!coa) {
        console.error('COA not found');
        return;
    }

    console.log('--- COA Basic Info ---');
    console.log(`ID: ${coa.id}`);
    console.log(`Custom Name: ${coa.custom_name}`);
    console.log(`COA Number: ${coa.coa_number}`);

    console.log('\n--- Metadata Header ---');
    // Only print keys to avoid spam
    if (coa.metadata) {
        console.log('Metata Keys:', Object.keys(coa.metadata));
        console.log('Full Metadata:', JSON.stringify(coa.metadata, null, 2));
    } else {
        console.log('Metadata is NULL or EMPTY');
    }
}

inspectCOA();

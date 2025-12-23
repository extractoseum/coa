
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testMetadataUpdate() {
    console.log('🧪 Testing Metadata Update Logic...');

    // 1. Get a random COA
    const { data: coa, error: fetchError } = await supabase
        .from('coas')
        .select('*')
        .limit(1)
        .single();

    if (fetchError || !coa) {
        console.error('❌ Failed to fetch COA:', fetchError);
        return;
    }

    console.log(`Checking COA: ${coa.id} (Token: ${coa.public_token})`);
    console.log('Current Metadata:', JSON.stringify(coa.metadata, null, 2));

    // 2. Simulate Frontend Update Payload
    // Frontend sends partial metadata object
    const newMetadata = {
        description_short: "TEST UPDATE " + Date.now(),
        client_name: "TEST CLIENT UPDATED"
    };

    console.log('\nApplying Update:', newMetadata);

    // 3. Logic mirror of coaEnrichmentController.ts
    const updatedMetadata = {
        ...(coa.metadata || {}),
        ...newMetadata
    };

    console.log('\nMerged Metadata (Predicted):', JSON.stringify(updatedMetadata, null, 2));

    // 4. Perform Update
    const { error: updateError } = await supabase
        .from('coas')
        .update({ metadata: updatedMetadata })
        .eq('id', coa.id);

    if (updateError) {
        console.error('❌ Update Failed:', updateError);
        return;
    }

    // 5. Verify Update
    const { data: updatedCoa } = await supabase
        .from('coas')
        .select('metadata')
        .eq('id', coa.id)
        .single();

    console.log('\nUpdated Metadata in DB:', JSON.stringify(updatedCoa?.metadata, null, 2));

    // Check if client_info is preserved
    if (coa.metadata?.client_info && !updatedCoa?.metadata?.client_info) {
        console.error('❌ FAIL: client_info was lost!');
    } else if (updatedCoa?.metadata?.description_short !== newMetadata.description_short) {
        console.error('❌ FAIL: description_short was not updated!');
    } else {
        console.log('✅ SUCCESS: Metadata updated and fields preserved.');
    }
}

testMetadataUpdate();

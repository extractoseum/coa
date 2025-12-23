import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('Fixing Ara voice ID in DB...');

    const correctKinaId = 'Kq9pDHHIMmJsG9PEqOtv'; // Kina - Cute happy girl
    const wrongGeorgeId = 'JBFqnCBsd6RMkjVDRZzb'; // George - Storyteller

    // 1. Find the column
    const { data: column, error: fetchError } = await supabase
        .from('crm_columns')
        .select('*')
        .eq('name', 'Ventas / Ara')
        .single();

    if (fetchError || !column) {
        console.error('Column not found:', fetchError);
        return;
    }

    console.log('Current Column:', column.name);
    console.log('Current Voice Profile:', JSON.stringify(column.voice_profile, null, 2));

    const updatedProfile = {
        ...column.voice_profile,
        voice_id: correctKinaId
    };

    const { error: updateError } = await supabase
        .from('crm_columns')
        .update({ voice_profile: updatedProfile })
        .eq('id', column.id);

    if (updateError) {
        console.error('Update failed:', updateError);
    } else {
        console.log('✅ Successfully updated Voice ID to Kina (Kq9pDHHIMmJsG9PEqOtv)');
    }
}

main();

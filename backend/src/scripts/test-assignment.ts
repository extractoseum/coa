import { supabase } from '../config/supabase';

async function testAssignment() {
    console.log('Testing hologram assignment...\n');

    try {
        // 1. Get first unassigned CVV
        const { data: unassigned, error: fetchError } = await supabase
            .from('verification_codes')
            .select('id, cvv_code, coa_id')
            .is('coa_id', null)
            .limit(1);

        if (fetchError) {
            console.error('❌ Error fetching unassigned:', fetchError.message);
            return;
        }

        if (!unassigned || unassigned.length === 0) {
            console.log('⚠️  No unassigned CVVs found. Generate some first.');
            return;
        }

        console.log('✅ Found unassigned CVV:', unassigned[0].cvv_code);

        // 2. Try to update with assigned_at
        const { data: updated, error: updateError } = await supabase
            .from('verification_codes')
            .update({
                assigned_at: new Date().toISOString()
            })
            .eq('id', unassigned[0].id)
            .select();

        if (updateError) {
            console.error('\n❌ ASSIGNMENT ERROR:', updateError.message);
            console.error('\nThis likely means the "assigned_at" column does not exist.');
            console.log('\n📋 Run this SQL in Supabase SQL Editor:\n');
            console.log('ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;');
        } else {
            console.log('\n✅ Assignment successful!', updated);
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testAssignment();

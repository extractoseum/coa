const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDB() {
    console.log('Checking otp_codes table structure...');

    // Try to insert a dummy record with new structure
    const testIdentifier = 'test_diag_' + Date.now();

    const { data, error } = await supabase
        .from('otp_codes')
        .insert({
            identifier: testIdentifier,
            channel: 'email',
            code: '123456',
            expires_at: new Date().toISOString()
        })
        .select();

    if (error) {
        console.error('❌ Insert Error:', error);
        console.log('This likely means the migration DID NOT run correctly.');
        console.log('Error details:', JSON.stringify(error, null, 2));
    } else {
        console.log('✅ Insert Successful! The table structure is correct.');
        // Cleanup
        await supabase.from('otp_codes').delete().eq('identifier', testIdentifier);
    }
}

checkDB();

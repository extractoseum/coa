
const { supabase } = require('./dist/config/supabase');

async function debugScansDeep() {
    try {
        // 1. Inspect coa_scans schema
        const { data: scanSample } = await supabase.from('coa_scans').select('*').limit(1);
        if (scanSample && scanSample[0]) {
            console.log('Columns in coa_scans:', Object.keys(scanSample[0]));
        }

        // 2. Test Join with multiple field attempts
        const { data: joinTest, error: joinError } = await supabase
            .from('coa_scans')
            .select(`
                id,
                coa_id,
                coas (
                    id,
                    custom_title,
                    custom_name,
                    coa_number,
                    lab_report_number
                )
            `)
            .order('scanned_at', { ascending: false })
            .limit(5);

        if (joinError) {
            console.error('Join Error:', joinError);
        } else {
            console.log('Join Test Results:', JSON.stringify(joinTest, null, 2));
        }

    } catch (e) { console.error(e); }
    process.exit(0);
}
debugScansDeep();

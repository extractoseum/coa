import { supabase } from '../config/supabase';

async function createVerificationCodesTable() {
    console.log('Creating verification_codes table...');

    try {
        // Note: Supabase doesn't have direct SQL execution via client
        // We need to use the SQL editor in Supabase Dashboard or run this via pg client

        // For now, let's just test if the table exists by trying to query it
        const { data, error } = await supabase
            .from('verification_codes')
            .select('count')
            .limit(1);

        if (error) {
            console.error('Table does not exist or error:', error.message);
            console.log('\n⚠️  Please run this SQL in your Supabase SQL Editor:\n');
            console.log(`
CREATE TABLE IF NOT EXISTS public.verification_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coa_id UUID REFERENCES public.coas(id) ON DELETE CASCADE,
    cvv_code TEXT NOT NULL UNIQUE,
    label_id TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    first_scanned_at TIMESTAMP WITH TIME ZONE,
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    scan_count INTEGER DEFAULT 0,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_cvv ON public.verification_codes(cvv_code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_coa_id ON public.verification_codes(coa_id);

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
            `);
        } else {
            console.log('✅ Table verification_codes already exists!');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

createVerificationCodesTable();

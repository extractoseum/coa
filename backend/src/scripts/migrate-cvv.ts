import { supabase } from '../config/supabase';

async function migrate() {
    console.log('Creating verification_codes table...');

    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
        -- 3.5 Verification Codes (CVV Anti-Fraud System)
        CREATE TABLE IF NOT EXISTS public.verification_codes (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            coa_id UUID REFERENCES public.coas(id) ON DELETE CASCADE,
            cvv_code TEXT NOT NULL UNIQUE,
            generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            first_scanned_at TIMESTAMP WITH TIME ZONE,
            last_scanned_at TIMESTAMP WITH TIME ZONE,
            scan_count INTEGER DEFAULT 0,
            is_revoked BOOLEAN DEFAULT FALSE,
            revoked_at TIMESTAMP WITH TIME ZONE,
            revoked_reason TEXT
        );

        -- Index for fast CVV lookup
        CREATE INDEX IF NOT EXISTS idx_verification_codes_cvv ON public.verification_codes(cvv_code);
        CREATE INDEX IF NOT EXISTS idx_verification_codes_coa_id ON public.verification_codes(coa_id);
        `
    });

    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Migration successful:', data);
    }
}

migrate();

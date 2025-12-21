
import { supabase } from '../config/supabase';
import crypto from 'crypto';

const generateToken = () => crypto.randomBytes(4).toString('hex');

async function testInsert() {
    console.log("Testing DB Insert...");

    const publicToken = generateToken();
    const mockData = {
        lab_name: 'Unknown (Chromatogram)',
        batch_id: 'TEST-BATCH-001',
        analysis_date: 'N/A', // Potentially invalid date?
        cannabinoids: [],
        compliance_status: 'pass',
        thc_compliance_flag: true
    };

    // Logic from controller:
    const insertPayload = {
        public_token: publicToken,
        lab_name: mockData.lab_name,
        batch_id: mockData.batch_id || 'UNKNOWN',
        // POTENTIAL BUG: new Date('N/A') -> Invalid Date -> Postgres Error?
        // Or supabase client handles it?
        analysis_date: mockData.analysis_date && mockData.analysis_date !== 'N/A' ? new Date(mockData.analysis_date) : null,
        cannabinoids: mockData.cannabinoids,
        compliance_status: mockData.compliance_status || 'pending',
        thc_compliance_flag: mockData.thc_compliance_flag,
        pdf_url_original: 'http://example.com/test.pdf',
        status: 'active' // Wait, 'status' column doesn't exist in schema.sql!
    };

    console.log("Payload:", insertPayload);

    const { data, error } = await supabase
        .from('coas')
        .insert(insertPayload)
        .select()
        .single();

    if (error) {
        console.error("DB INSERT FAILED:", error);
    } else {
        console.log("SUCCESS:", data);
    }
}

testInsert();

// Re-extract a specific COA from its PDF
import { createClient } from '@supabase/supabase-js';
import { COAExtractor } from '../services/coaExtractor';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reextractCOA(token: string) {
    console.log(`\n=== Re-extracting COA: ${token} ===\n`);

    // 1. Get COA from database
    const { data: coa, error: coaError } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', token)
        .single();

    if (coaError || !coa) {
        console.error('COA not found:', coaError?.message);
        return;
    }

    console.log('Found COA:', coa.id, coa.custom_name || coa.product_sku);
    const pdfUrl = coa.pdf_url_original || coa.pdf_url_branded;
    console.log('PDF URL:', pdfUrl);

    if (!pdfUrl) {
        console.error('No PDF URL found for this COA');
        return;
    }

    // 2. Download PDF
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
        console.error('Failed to download PDF:', pdfResponse.status);
        return;
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    console.log('Downloaded PDF:', pdfBuffer.length, 'bytes');

    // 3. Extract data
    const extractor = new COAExtractor();

    const result = await extractor.extractFromBuffers([pdfBuffer]);

    console.log('\n=== Extraction Result ===');
    console.log('Cannabinoids:', result.cannabinoids?.length || 0);

    if (result.cannabinoids && result.cannabinoids.length > 0) {
        console.log('\nExtracted cannabinoids:');
        for (const c of result.cannabinoids) {
            console.log(`  ${c.analyte}: ${c.result_pct}% (${c.result_mg_g} mg/g)`);
        }
    }

    if (result.metadata?.chromatography_peaks) {
        console.log('\nChromatography peaks:', result.metadata.chromatography_peaks.length);
        for (const p of result.metadata.chromatography_peaks.slice(0, 10)) {
            console.log(`  ${p.peak_name}: RT=${p.retention_time}, Area=${p.area}, PPM=${p.amount_ppm}`);
        }
    }

    // 4. Update database if extraction successful
    if (result.cannabinoids && result.cannabinoids.length > 0) {
        console.log('\n=== Updating database ===');

        const { error: updateError } = await supabase
            .from('coas')
            .update({
                cannabinoids: result.cannabinoids,
                metadata: {
                    ...coa.metadata,
                    reextracted_at: new Date().toISOString(),
                    extraction_method: 'chromeleon_squashed_v2',
                    chromatography_peaks: result.metadata?.chromatography_peaks || []
                }
            })
            .eq('id', coa.id);

        if (updateError) {
            console.error('Update failed:', updateError.message);
        } else {
            console.log('✅ Database updated successfully!');
        }
    } else {
        console.log('\n❌ No cannabinoids extracted, skipping update');
    }
}

// Get token from command line or use default
const token = process.argv[2] || '05604ab5';
reextractCOA(token).catch(console.error);

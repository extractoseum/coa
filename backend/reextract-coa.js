// Script to re-extract a COA and update the database
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { COAExtractor } = require('./dist/services/coaExtractor');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const COA_TOKEN = process.argv[2] || 'd618b2a0'; // Pass token as argument

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadFile(response.headers.location).then(resolve).catch(reject);
            }

            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function reextractCOA() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log('Fetching COA with token:', COA_TOKEN);

    // Get the COA
    const { data: coa, error } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', COA_TOKEN)
        .single();

    if (error || !coa) {
        console.error('Error fetching COA:', error);
        return;
    }

    console.log('Found COA:', coa.product_name);
    console.log('Current metadata keys:', Object.keys(coa.metadata || {}));

    // Get the PDF URL from metadata
    const fileUrls = coa.metadata?.file_urls || [];
    if (fileUrls.length === 0) {
        console.error('No PDF files found in COA metadata');
        return;
    }

    const pdfUrl = fileUrls[0];
    console.log('PDF URL:', pdfUrl);

    // Download the PDF
    console.log('Downloading PDF...');
    const pdfBuffer = await downloadFile(pdfUrl);
    console.log('PDF downloaded, size:', pdfBuffer.length, 'bytes');

    // Extract data
    console.log('Extracting data...');
    const extractor = new COAExtractor();
    const extracted = await extractor.extractFromBuffer(pdfBuffer);

    console.log('\n=== EXTRACTION RESULTS ===');
    console.log('Cannabinoids found:', extracted.cannabinoids?.length);
    extracted.cannabinoids?.forEach(c => {
        console.log(`  - ${c.name}: ${c.result}${c.unit} (RT: ${c.retention_time}, Area: ${c.area})`);
    });

    console.log('\nMetadata keys:', Object.keys(extracted.metadata || {}));
    console.log('Injection details:', extracted.metadata?.injection_details ? 'YES' : 'NO');
    console.log('Peaks:', extracted.metadata?.peaks?.length || 0);

    if (extracted.metadata?.peaks) {
        console.log('\n=== PEAKS DATA ===');
        extracted.metadata.peaks.forEach(p => {
            console.log(`  Peak ${p.peak_no}: ${p.peak_name} - RT: ${p.retention_time}, Area: ${p.area}, Amount: ${p.amount_ppm || 'n.a.'}`);
        });
    }

    if (extracted.metadata?.injection_details) {
        console.log('\n=== INJECTION DETAILS ===');
        Object.entries(extracted.metadata.injection_details).forEach(([k, v]) => {
            console.log(`  ${k}: ${v}`);
        });
    }

    // Update the COA in database
    console.log('\n=== UPDATING DATABASE ===');

    const mergedMetadata = {
        ...extracted.metadata,
        file_urls: fileUrls,
        original_filenames: coa.metadata?.original_filenames || []
    };

    const { error: updateError } = await supabase
        .from('coas')
        .update({
            cannabinoids: extracted.cannabinoids,
            metadata: mergedMetadata
        })
        .eq('id', coa.id);

    if (updateError) {
        console.error('Error updating COA:', updateError);
        return;
    }

    console.log('\n✅ COA updated successfully!');
    console.log('Cannabinoids saved:', extracted.cannabinoids?.length);
    console.log('Peaks saved:', extracted.metadata?.peaks?.length || 0);
    console.log('Injection details saved:', extracted.metadata?.injection_details ? 'YES' : 'NO');
}

reextractCOA().catch(console.error);

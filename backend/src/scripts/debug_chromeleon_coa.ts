
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { COAExtractor } from '../services/coaExtractor';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugExtraction() {
    const token = 'aaeaca91';
    console.log(`🔍 Debugging extraction for COA with token: ${token}`);

    const { data: coa, error } = await supabase
        .from('coas')
        .select('*')
        .eq('public_token', token)
        .single();

    if (error || !coa) {
        console.error('Error fetching COA:', error);
        return;
    }

    if (!coa.pdf_url_original) {
        console.error('No original PDF URL found');
        return;
    }

    console.log(`📥 Downloading PDF from: ${coa.pdf_url_original}`);
    const response = await axios.get(coa.pdf_url_original, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const extractor = new COAExtractor();

    // We want to see the RAW text that extractFromBuffer sees
    const pdfLib = require('pdf-parse');
    const pdf = typeof pdfLib === 'function' ? pdfLib : pdfLib.default;
    const data = await pdf(buffer);
    const text = data.text;

    console.log('\n--- RAW PDF TEXT (Selection) ---');
    // Look for Integration Results
    const integrationIdx = text.indexOf('Integration Results');
    if (integrationIdx !== -1) {
        console.log(text.substring(integrationIdx, integrationIdx + 2000));
    } else {
        console.log('Integration Results NOT FOUND in raw text!');
        console.log('First 2000 chars of text:');
        console.log(text.substring(0, 2000));
    }

    console.log('\n--- Running Extraction ---');
    const result = await extractor.extractFromBuffer(buffer);

    console.log('\n--- Extracted Results ---');
    console.log(`Lab: ${result.lab_name}`);
    console.log(`Cannabinoids Count: ${result.cannabinoids.length}`);
    console.log(`Peaks Count: ${result.metadata?.peaks?.length || 0}`);
    console.log(`Total Area: ${result.metadata?.total_area}`);

    if (result.cannabinoids.length > 0) {
        console.log('Sample Cannabinoid:', result.cannabinoids[0]);
    }
}

debugExtraction().catch(console.error);

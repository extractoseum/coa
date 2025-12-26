
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the parent directory's .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestScans() {
    console.log('🔍 Checking latest scans in DB...');

    const { data: scans, error } = await supabase
        .from('coa_scans')
        .select('*')
        .order('scanned_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching scans:', error);
        return;
    }

    if (!scans || scans.length === 0) {
        console.log('No scans found.');
        return;
    }

    console.log(`✅ Found ${scans.length} recent scans:`);
    scans.forEach(scan => {
        // Correct for timezone if needed (printing plain ISO for now)
        console.log(`[${scan.scanned_at}] Type: ${scan.access_type} | Device: ${scan.device_type} (${scan.os}) | IP Hash: ${scan.ip_hash.substring(0, 8)}... | Link Source: ${scan.link_source || 'N/A'}`);
    });
}

checkLatestScans();

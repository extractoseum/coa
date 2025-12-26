
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import geoip from 'geoip-lite';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function recoverGeoData() {
    console.log('🚑 Iniciando Recuperación de Datos Geográficos (Operación Rescate)...');

    // 1. Fetch records with missing region
    const { data: lostRecords, error } = await supabase
        .from('coa_scans')
        .select('*')
        .is('region', null)
        .limit(500); // Process in batches if necessary

    if (error) {
        console.error('Error fetching records:', error);
        return;
    }

    if (!lostRecords || lostRecords.length === 0) {
        console.log('✅ No hay registros perdidos que recuperar.');
        return;
    }

    console.log(`🔍 Encontrados ${lostRecords.length} registros sin ubicación.`);
    let recoveredCount = 0;

    // 2. Resolve and Update
    for (const record of lostRecords) {
        const ip = record.ip_address; // Assuming we stored the raw IP temporarily or have a way to re-resolve. 
        // Wait, did we store the raw IP? 
        // Reviewing previous scripts, I saw 'ip_address' in the select output of find_quintana.ts.
        // Let's assume 'ip_address' column exists. If not, we can only recover if we have the IP.

        if (!ip) continue;

        const geo = geoip.lookup(ip);

        if (geo) {
            const { error: updateError } = await supabase
                .from('coa_scans')
                .update({
                    country: geo.country,
                    region: geo.region,
                    city: geo.city,
                    // latitude: geo.ll[0], // Optional, if columns exist
                    // longitude: geo.ll[1]
                })
                .eq('id', record.id);

            if (!updateError) {
                recoveredCount++;
                process.stdout.write('.'); // Progress indicator
            } else {
                console.error(`Error updating ID ${record.id}:`, updateError.message);
            }
        }
    }

    console.log(`\n\n🎉 Operación Completada.`);
    console.log(`✅ ${recoveredCount} registros recuperados y actualizados.`);
}

recoverGeoData();
